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

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_house_id ON users(house_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_children_user_id ON children(user_id);
CREATE INDEX IF NOT EXISTS idx_children_house_id ON children(house_id);
CREATE INDEX IF NOT EXISTS idx_points_child_id ON points(child_id);
CREATE INDEX IF NOT EXISTS idx_points_parent_id ON points(parent_id);
CREATE INDEX IF NOT EXISTS idx_points_created_at ON points(created_at);


