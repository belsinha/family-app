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

-- Create indexes for projects
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_start_date ON projects(start_date);

-- Create a default project for existing work logs (if work_logs table exists and has data)
INSERT INTO projects (name, description, start_date, bonus_rate, status)
SELECT 
  'Default Project',
  'Default project for migrated work logs',
  CURRENT_DATE,
  1.0,
  'inactive'
WHERE NOT EXISTS (SELECT 1 FROM projects WHERE name = 'Default Project')
AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'work_logs');

-- Add project_id and status columns to work_logs table if it exists
-- Use DO block to handle conditional column addition
DO $$ 
BEGIN
  -- Check if work_logs table exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'work_logs') THEN
    -- Add project_id column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='work_logs' AND column_name='project_id') THEN
      ALTER TABLE work_logs ADD COLUMN project_id BIGINT;
    END IF;
    
    -- Add status column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='work_logs' AND column_name='status') THEN
      ALTER TABLE work_logs ADD COLUMN status TEXT CHECK(status IN ('pending', 'approved', 'declined')) DEFAULT 'approved';
    END IF;
    
    -- Update existing work logs to reference the default project and set status to approved
    UPDATE work_logs
    SET 
      project_id = (SELECT id FROM projects WHERE name = 'Default Project' LIMIT 1),
      status = 'approved'
    WHERE project_id IS NULL;
    
    -- Now make project_id NOT NULL and add foreign key (if columns are still nullable)
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='work_logs' AND column_name='project_id' AND is_nullable='YES') THEN
      ALTER TABLE work_logs ALTER COLUMN project_id SET NOT NULL;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='work_logs' AND column_name='status' AND is_nullable='YES') THEN
      ALTER TABLE work_logs ALTER COLUMN status SET NOT NULL;
    END IF;
    
    -- Drop existing foreign key if it exists (to recreate it)
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_work_logs_project' AND table_name = 'work_logs') THEN
      ALTER TABLE work_logs DROP CONSTRAINT fk_work_logs_project;
    END IF;
    
    -- Add foreign key constraint
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_work_logs_project' AND table_name = 'work_logs') THEN
      ALTER TABLE work_logs
      ADD CONSTRAINT fk_work_logs_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT;
    END IF;
  END IF;
END $$;

-- Create indexes for work_logs (only if table exists - will fail silently if not)
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'work_logs') THEN
    CREATE INDEX IF NOT EXISTS idx_work_logs_project_id ON work_logs(project_id);
    CREATE INDEX IF NOT EXISTS idx_work_logs_status ON work_logs(status);
  END IF;
END $$;

