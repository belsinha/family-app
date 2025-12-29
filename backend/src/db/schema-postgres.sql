-- Houses table
CREATE TABLE IF NOT EXISTS houses (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('parent', 'child', 'family')),
  house_id INTEGER,
  password_hash TEXT,
  FOREIGN KEY (house_id) REFERENCES houses(id)
);

-- Children table (linked to users)
CREATE TABLE IF NOT EXISTS children (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  user_id INTEGER,
  house_id INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (house_id) REFERENCES houses(id)
);

-- Points table
CREATE TABLE IF NOT EXISTS points (
  id SERIAL PRIMARY KEY,
  child_id INTEGER NOT NULL,
  points INTEGER NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('bonus', 'demerit')),
  reason TEXT,
  parent_id INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (child_id) REFERENCES children(id),
  FOREIGN KEY (parent_id) REFERENCES users(id)
);

