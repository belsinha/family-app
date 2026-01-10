-- Create work_logs table for Supabase
-- Run this SQL in your Supabase SQL editor if the table doesn't exist

CREATE TABLE IF NOT EXISTS work_logs (
  id BIGSERIAL PRIMARY KEY,
  child_id BIGINT NOT NULL,
  hours NUMERIC NOT NULL CHECK(hours > 0),
  description TEXT NOT NULL,
  work_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_work_logs_child_id ON work_logs(child_id);
CREATE INDEX IF NOT EXISTS idx_work_logs_work_date ON work_logs(work_date);
CREATE INDEX IF NOT EXISTS idx_work_logs_created_at ON work_logs(created_at);

