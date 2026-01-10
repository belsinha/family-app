-- Migration script to add projects and update work_logs for project-based work logging
-- Run this SQL in your Supabase SQL editor if you have an existing database

-- Create projects table
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

-- Add project_id and status columns to work_logs table
-- Note: This assumes work_logs table already exists
-- If you have existing data, you'll need to handle it appropriately

-- First, add columns as nullable temporarily
ALTER TABLE work_logs 
ADD COLUMN IF NOT EXISTS project_id BIGINT,
ADD COLUMN IF NOT EXISTS status TEXT CHECK(status IN ('pending', 'approved', 'declined')) DEFAULT 'pending';

-- Create a default project for existing work logs (optional)
-- You may want to customize this based on your needs
INSERT INTO projects (name, description, start_date, bonus_rate, status)
SELECT 
  'Default Project',
  'Default project for migrated work logs',
  CURRENT_DATE,
  1.0,
  'inactive'
WHERE NOT EXISTS (SELECT 1 FROM projects WHERE name = 'Default Project');

-- Update existing work logs to reference the default project and set status to approved
-- This assumes all existing work logs should be marked as approved
UPDATE work_logs
SET 
  project_id = (SELECT id FROM projects WHERE name = 'Default Project' LIMIT 1),
  status = 'approved'
WHERE project_id IS NULL;

-- Now make project_id NOT NULL and add foreign key
ALTER TABLE work_logs
ALTER COLUMN project_id SET NOT NULL,
ALTER COLUMN status SET NOT NULL,
ADD CONSTRAINT fk_work_logs_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_start_date ON projects(start_date);
CREATE INDEX IF NOT EXISTS idx_work_logs_project_id ON work_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_work_logs_status ON work_logs(status);

