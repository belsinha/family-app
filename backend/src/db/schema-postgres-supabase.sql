-- Houses table
CREATE TABLE IF NOT EXISTS houses (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('parent', 'child', 'family')),
  house_id BIGINT,
  password_hash TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  FOREIGN KEY (house_id) REFERENCES houses(id) ON DELETE SET NULL
);

-- Children table (linked to users)
CREATE TABLE IF NOT EXISTS children (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  user_id BIGINT,
  house_id BIGINT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (house_id) REFERENCES houses(id) ON DELETE SET NULL
);

-- Points table
CREATE TABLE IF NOT EXISTS points (
  id BIGSERIAL PRIMARY KEY,
  child_id BIGINT NOT NULL,
  points INTEGER NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('bonus', 'demerit')),
  reason TEXT,
  parent_id BIGINT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Bitcoin price cache table
CREATE TABLE IF NOT EXISTS bitcoin_price_cache (
  id BIGSERIAL PRIMARY KEY,
  price_usd NUMERIC NOT NULL,
  fetched_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Bitcoin conversions table
CREATE TABLE IF NOT EXISTS bitcoin_conversions (
  id BIGSERIAL PRIMARY KEY,
  child_id BIGINT NOT NULL,
  point_id BIGINT,
  bonus_points_converted INTEGER NOT NULL,
  satoshis BIGINT NOT NULL,
  btc_amount NUMERIC NOT NULL,
  usd_value NUMERIC NOT NULL,
  price_usd NUMERIC NOT NULL,
  price_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  parent_id BIGINT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE,
  FOREIGN KEY (point_id) REFERENCES points(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
  id BIGSERIAL PRIMARY KEY,
  house_id BIGINT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  start_date DATE NOT NULL,
  end_date DATE,
  bonus_rate NUMERIC NOT NULL CHECK(bonus_rate >= 0),
  status TEXT NOT NULL CHECK(status IN ('active', 'inactive')) DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  FOREIGN KEY (house_id) REFERENCES houses(id) ON DELETE CASCADE
);

-- CREATE TABLE IF NOT EXISTS does not add columns to an older table.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS house_id BIGINT;

-- Composite ownership keys used to make cross-house child/project pairings impossible.
CREATE UNIQUE INDEX IF NOT EXISTS idx_children_id_house_id ON children(id, house_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_id_house_id ON projects(id, house_id);

-- Work logs table
CREATE TABLE IF NOT EXISTS work_logs (
  id BIGSERIAL PRIMARY KEY,
  house_id BIGINT NOT NULL,
  child_id BIGINT NOT NULL,
  project_id BIGINT NOT NULL,
  hours NUMERIC NOT NULL CHECK(hours > 0),
  description TEXT NOT NULL,
  work_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL CHECK(status IN ('pending', 'approved', 'declined')) DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT work_logs_house_id_fkey FOREIGN KEY (house_id) REFERENCES houses(id) ON DELETE CASCADE,
  CONSTRAINT work_logs_child_house_fkey FOREIGN KEY (child_id, house_id) REFERENCES children(id, house_id) ON DELETE CASCADE,
  CONSTRAINT work_logs_project_house_fkey FOREIGN KEY (project_id, house_id) REFERENCES projects(id, house_id) ON DELETE RESTRICT
);

-- Upgrade existing installations created before project/work-log tenant ownership existed.
-- Rows are backfilled only when their house can be derived without guessing. Any ambiguous
-- legacy project keeps NULL and is consequently invisible to all house-scoped backend queries.
ALTER TABLE work_logs ADD COLUMN IF NOT EXISTS house_id BIGINT;

UPDATE work_logs wl
SET house_id = c.house_id
FROM children c
WHERE wl.child_id = c.id
  AND wl.house_id IS NULL
  AND c.house_id IS NOT NULL;

UPDATE projects p
SET house_id = derived.house_id
FROM (
  SELECT wl.project_id, MIN(wl.house_id) AS house_id
  FROM work_logs wl
  WHERE wl.house_id IS NOT NULL
  GROUP BY wl.project_id
  HAVING COUNT(DISTINCT wl.house_id) = 1
) derived
WHERE p.id = derived.project_id
  AND p.house_id IS NULL;

UPDATE projects
SET house_id = (SELECT MIN(id) FROM houses)
WHERE house_id IS NULL
  AND (SELECT COUNT(*) FROM houses) = 1;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'projects_house_id_fkey') THEN
    ALTER TABLE projects
      ADD CONSTRAINT projects_house_id_fkey FOREIGN KEY (house_id) REFERENCES houses(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_logs_house_id_fkey') THEN
    ALTER TABLE work_logs
      ADD CONSTRAINT work_logs_house_id_fkey FOREIGN KEY (house_id) REFERENCES houses(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_logs_child_house_fkey') THEN
    ALTER TABLE work_logs
      ADD CONSTRAINT work_logs_child_house_fkey
      FOREIGN KEY (child_id, house_id) REFERENCES children(id, house_id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_logs_project_house_fkey') THEN
    ALTER TABLE work_logs
      ADD CONSTRAINT work_logs_project_house_fkey
      FOREIGN KEY (project_id, house_id) REFERENCES projects(id, house_id) ON DELETE RESTRICT NOT VALID;
  END IF;
END $$;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_house_id ON users(house_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_children_user_id ON children(user_id);
CREATE INDEX IF NOT EXISTS idx_children_house_id ON children(house_id);
CREATE INDEX IF NOT EXISTS idx_points_child_id ON points(child_id);
CREATE INDEX IF NOT EXISTS idx_points_parent_id ON points(parent_id);
CREATE INDEX IF NOT EXISTS idx_points_created_at ON points(created_at);
CREATE INDEX IF NOT EXISTS idx_bitcoin_price_cache_fetched_at ON bitcoin_price_cache(fetched_at);
CREATE INDEX IF NOT EXISTS idx_bitcoin_conversions_child_id ON bitcoin_conversions(child_id);
CREATE INDEX IF NOT EXISTS idx_bitcoin_conversions_parent_id ON bitcoin_conversions(parent_id);
CREATE INDEX IF NOT EXISTS idx_bitcoin_conversions_created_at ON bitcoin_conversions(created_at);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_house_id ON projects(house_id);
CREATE INDEX IF NOT EXISTS idx_projects_start_date ON projects(start_date);
CREATE INDEX IF NOT EXISTS idx_work_logs_child_id ON work_logs(child_id);
CREATE INDEX IF NOT EXISTS idx_work_logs_house_id ON work_logs(house_id);
CREATE INDEX IF NOT EXISTS idx_work_logs_project_id ON work_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_work_logs_status ON work_logs(status);
CREATE INDEX IF NOT EXISTS idx_work_logs_work_date ON work_logs(work_date);
CREATE INDEX IF NOT EXISTS idx_work_logs_created_at ON work_logs(created_at);

-- Challenges table (parent-set goals for a child with deadline and optional reward)
CREATE TABLE IF NOT EXISTS challenges (
  id BIGSERIAL PRIMARY KEY,
  child_id BIGINT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  deadline DATE NOT NULL,
  reward_type TEXT NOT NULL CHECK(reward_type IN ('bonus_points', 'custom')),
  reward_points INT,
  reward_description TEXT,
  target_number INT,
  target_unit TEXT,
  status TEXT NOT NULL CHECK(status IN ('active', 'completed', 'failed', 'expired')) DEFAULT 'active',
  rewarded_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by BIGINT,
  FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Challenge progress log (child logs progress entries)
CREATE TABLE IF NOT EXISTS challenge_progress (
  id BIGSERIAL PRIMARY KEY,
  challenge_id BIGINT NOT NULL,
  note TEXT NOT NULL,
  amount NUMERIC,
  logged_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by BIGINT,
  FOREIGN KEY (challenge_id) REFERENCES challenges(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_challenges_child_id ON challenges(child_id);
CREATE INDEX IF NOT EXISTS idx_challenges_status ON challenges(status);
CREATE INDEX IF NOT EXISTS idx_challenge_progress_challenge_id ON challenge_progress(challenge_id);

-- On-chain Bitcoin wallets per child (custodial HD derivation)
CREATE TABLE IF NOT EXISTS child_onchain_wallets (
  id BIGSERIAL PRIMARY KEY,
  child_id BIGINT NOT NULL UNIQUE,
  derivation_index INTEGER NOT NULL UNIQUE,
  receive_address TEXT NOT NULL UNIQUE,
  network TEXT NOT NULL CHECK(network IN ('mainnet', 'testnet')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_chain_sync_at TIMESTAMP WITH TIME ZONE,
  FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE
);

-- Credit payouts (on-chain settlement or manual Apple Cash)
CREATE TABLE IF NOT EXISTS child_credit_payouts (
  id BIGSERIAL PRIMARY KEY,
  child_id BIGINT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('onchain_settlement', 'apple_cash_manual')),
  satoshis BIGINT NOT NULL CHECK(satoshis > 0),
  usd_amount NUMERIC,
  note TEXT,
  parent_id BIGINT,
  txid TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_child_onchain_wallets_child_id ON child_onchain_wallets(child_id);
CREATE INDEX IF NOT EXISTS idx_child_credit_payouts_child_id ON child_credit_payouts(child_id);
CREATE INDEX IF NOT EXISTS idx_child_credit_payouts_parent_id ON child_credit_payouts(parent_id);
CREATE INDEX IF NOT EXISTS idx_child_credit_payouts_type ON child_credit_payouts(type);
CREATE INDEX IF NOT EXISTS idx_child_credit_payouts_created_at ON child_credit_payouts(created_at);

-- ── Row Level Security: deny-by-default ─────────────────────────────────────
-- All application access goes through the backend, which authenticates with the
-- SERVICE ROLE key (bypasses RLS). Enabling RLS with NO policies means the anon /
-- authenticated PostgREST roles can read or write NOTHING, so a leaked anon key or a
-- direct request to the project's REST endpoint exposes no data. Authorization
-- (child-vs-parent, house containment) is enforced in backend/src route guards.
--
-- NOTE: this requires SUPABASE_SERVICE_ROLE_KEY to be set for the backend. Running the
-- backend on the anon key only (the fallback in db/supabase.ts) will fail once RLS is on.
ALTER TABLE houses ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE children ENABLE ROW LEVEL SECURITY;
ALTER TABLE points ENABLE ROW LEVEL SECURITY;
ALTER TABLE bitcoin_price_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE bitcoin_conversions ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE challenge_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE child_onchain_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE child_credit_payouts ENABLE ROW LEVEL SECURITY;


