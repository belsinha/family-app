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
  name TEXT NOT NULL,
  description TEXT,
  start_date DATE NOT NULL,
  end_date DATE,
  bonus_rate NUMERIC NOT NULL CHECK(bonus_rate >= 0),
  status TEXT NOT NULL CHECK(status IN ('active', 'inactive')) DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Work logs table
CREATE TABLE IF NOT EXISTS work_logs (
  id BIGSERIAL PRIMARY KEY,
  child_id BIGINT NOT NULL,
  project_id BIGINT NOT NULL,
  hours NUMERIC NOT NULL CHECK(hours > 0),
  description TEXT NOT NULL,
  work_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL CHECK(status IN ('pending', 'approved', 'declined')) DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT
);

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
CREATE INDEX IF NOT EXISTS idx_projects_start_date ON projects(start_date);
CREATE INDEX IF NOT EXISTS idx_work_logs_child_id ON work_logs(child_id);
CREATE INDEX IF NOT EXISTS idx_work_logs_project_id ON work_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_work_logs_status ON work_logs(status);
CREATE INDEX IF NOT EXISTS idx_work_logs_work_date ON work_logs(work_date);
CREATE INDEX IF NOT EXISTS idx_work_logs_created_at ON work_logs(created_at);


