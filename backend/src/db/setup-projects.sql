-- ============================================================================
-- Project-Based Work Logging Setup Script
-- ============================================================================
-- Run this entire script in your Supabase SQL Editor
-- This will create the projects table and update work_logs table if needed
-- ============================================================================

-- Step 1: Create projects table
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

-- Step 2: Create indexes for projects
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_start_date ON projects(start_date);

-- Step 3: Handle work_logs table migration
DO $$ 
BEGIN
  -- Check if work_logs table exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'work_logs') THEN
    -- Table exists, check if it needs migration
    
    -- Add project_id column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='work_logs' AND column_name='project_id') THEN
      ALTER TABLE work_logs ADD COLUMN project_id BIGINT;
      RAISE NOTICE 'Added project_id column to work_logs';
    END IF;
    
    -- Add status column if it doesn't exist (without inline constraint to avoid naming conflicts)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='work_logs' AND column_name='status') THEN
      ALTER TABLE work_logs ADD COLUMN status TEXT DEFAULT 'pending';
      RAISE NOTICE 'Added status column to work_logs';
    END IF;
    
    -- Create a default project for existing work logs (if any exist)
    INSERT INTO projects (name, description, start_date, bonus_rate, status)
    SELECT 
      'Default Project',
      'Default project for migrated work logs',
      CURRENT_DATE,
      1.0,
      'inactive'
    WHERE NOT EXISTS (SELECT 1 FROM projects WHERE name = 'Default Project')
    AND EXISTS (SELECT 1 FROM work_logs WHERE project_id IS NULL LIMIT 1);
    
    -- Update existing work logs to reference the default project
    UPDATE work_logs
    SET 
      project_id = (SELECT id FROM projects WHERE name = 'Default Project' LIMIT 1),
      status = COALESCE(status, 'approved')
    WHERE project_id IS NULL;
    
    -- Make columns NOT NULL after populating data
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='work_logs' AND column_name='project_id' AND is_nullable='YES') THEN
      -- Only make NOT NULL if all rows have project_id
      IF NOT EXISTS (SELECT 1 FROM work_logs WHERE project_id IS NULL) THEN
        ALTER TABLE work_logs ALTER COLUMN project_id SET NOT NULL;
        RAISE NOTICE 'Made project_id NOT NULL';
      END IF;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='work_logs' AND column_name='status' AND is_nullable='YES') THEN
      ALTER TABLE work_logs ALTER COLUMN status SET NOT NULL;
      RAISE NOTICE 'Made status NOT NULL';
    END IF;
    
    -- Drop existing status constraint if it exists (to recreate it with proper name)
    IF EXISTS (
      SELECT 1 FROM pg_constraint 
      WHERE conrelid = 'work_logs'::regclass 
      AND conname LIKE '%status%'
    ) THEN
      EXECUTE (
        SELECT 'ALTER TABLE work_logs DROP CONSTRAINT ' || conname
        FROM pg_constraint
        WHERE conrelid = 'work_logs'::regclass
        AND conname LIKE '%status%'
        LIMIT 1
      );
      RAISE NOTICE 'Dropped existing status constraint';
    END IF;
    
    -- Add named status constraint
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint 
      WHERE conrelid = 'work_logs'::regclass 
      AND conname = 'work_logs_status_check'
    ) THEN
      ALTER TABLE work_logs
      ADD CONSTRAINT work_logs_status_check CHECK (status IN ('pending', 'approved', 'declined'));
      RAISE NOTICE 'Added work_logs_status_check constraint';
    END IF;
    
    -- Drop existing foreign key if it exists (to recreate it)
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_work_logs_project' AND table_name = 'work_logs') THEN
      ALTER TABLE work_logs DROP CONSTRAINT fk_work_logs_project;
    END IF;
    
    -- Add foreign key constraint
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_work_logs_project' AND table_name = 'work_logs') THEN
      ALTER TABLE work_logs
      ADD CONSTRAINT fk_work_logs_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT;
      RAISE NOTICE 'Added foreign key constraint fk_work_logs_project';
    END IF;
    
  ELSE
    -- work_logs table doesn't exist yet, it will be created with the new schema
    -- when the application runs or when schema-postgres-supabase.sql is executed
    RAISE NOTICE 'work_logs table does not exist yet. It will be created with project_id and status when needed.';
  END IF;
END $$;

-- Step 4: Create indexes for work_logs (if table exists)
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'work_logs') THEN
    CREATE INDEX IF NOT EXISTS idx_work_logs_project_id ON work_logs(project_id);
    CREATE INDEX IF NOT EXISTS idx_work_logs_status ON work_logs(status);
    RAISE NOTICE 'Created indexes for work_logs';
  END IF;
END $$;

-- Step 5: Create a sample active project (optional - you can delete this if you don't want it)
INSERT INTO projects (name, description, start_date, bonus_rate, status)
SELECT 
  'General Work',
  'General work activities',
  CURRENT_DATE,
  1.0,
  'active'
WHERE NOT EXISTS (SELECT 1 FROM projects WHERE status = 'active' LIMIT 1);

-- Success message
DO $$ 
BEGIN
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Migration completed successfully!';
  RAISE NOTICE 'Projects table is ready to use.';
  RAISE NOTICE '============================================================================';
END $$;

