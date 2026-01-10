-- Houses table
CREATE TABLE IF NOT EXISTS houses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('parent', 'child', 'family')),
  house_id INTEGER,
  password_hash TEXT,
  FOREIGN KEY (house_id) REFERENCES houses(id)
);

-- Children table (linked to users)
CREATE TABLE IF NOT EXISTS children (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  user_id INTEGER,
  house_id INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (house_id) REFERENCES houses(id)
);

-- Points table
CREATE TABLE IF NOT EXISTS points (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  child_id INTEGER NOT NULL,
  points INTEGER NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('bonus', 'demerit')),
  reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (child_id) REFERENCES children(id)
);

-- Work logs table
CREATE TABLE IF NOT EXISTS work_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  child_id INTEGER NOT NULL,
  hours REAL NOT NULL CHECK(hours > 0),
  description TEXT NOT NULL,
  work_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (child_id) REFERENCES children(id)
);

-- Create indexes for work logs
CREATE INDEX IF NOT EXISTS idx_work_logs_child_id ON work_logs(child_id);
CREATE INDEX IF NOT EXISTS idx_work_logs_work_date ON work_logs(work_date);
CREATE INDEX IF NOT EXISTS idx_work_logs_created_at ON work_logs(created_at);


