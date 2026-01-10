-- Fix work_logs status constraint
-- Run this in Supabase SQL Editor if you're getting constraint violations

-- First, check if the constraint exists and what it allows
-- This query will show the constraint definition
SELECT 
    conname AS constraint_name,
    pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'work_logs'::regclass
AND conname LIKE '%status%';

-- Drop the existing constraint if it exists (in case it's malformed)
DO $$ 
BEGIN
    -- Try to drop any existing status constraint
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conrelid = 'work_logs'::regclass 
        AND conname LIKE '%status%'
    ) THEN
        -- Get constraint name and drop it
        EXECUTE (
            SELECT 'ALTER TABLE work_logs DROP CONSTRAINT ' || conname
            FROM pg_constraint
            WHERE conrelid = 'work_logs'::regclass
            AND conname LIKE '%status%'
            LIMIT 1
        );
        RAISE NOTICE 'Dropped existing status constraint';
    END IF;
END $$;

-- Ensure status column exists with correct type
DO $$ 
BEGIN
    -- Add status column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'work_logs' 
        AND column_name = 'status'
    ) THEN
        ALTER TABLE work_logs ADD COLUMN status TEXT DEFAULT 'pending';
        RAISE NOTICE 'Added status column';
    END IF;
END $$;

-- Set default value for any NULL statuses (shouldn't happen, but just in case)
UPDATE work_logs SET status = 'pending' WHERE status IS NULL;

-- Make status NOT NULL if it isn't already
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'work_logs' 
        AND column_name = 'status' 
        AND is_nullable = 'YES'
    ) THEN
        ALTER TABLE work_logs ALTER COLUMN status SET NOT NULL;
        RAISE NOTICE 'Made status column NOT NULL';
    END IF;
END $$;

-- Add the correct constraint (allowing pending, approved, declined)
DO $$ 
BEGIN
    -- Check if constraint already exists with correct definition
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conrelid = 'work_logs'::regclass 
        AND conname = 'work_logs_status_check'
        AND pg_get_constraintdef(oid) LIKE '%pending%approved%declined%'
    ) THEN
        -- Add the constraint
        ALTER TABLE work_logs 
        ADD CONSTRAINT work_logs_status_check 
        CHECK (status IN ('pending', 'approved', 'declined'));
        
        RAISE NOTICE 'Added work_logs_status_check constraint';
    ELSE
        RAISE NOTICE 'Constraint already exists with correct definition';
    END IF;
EXCEPTION
    WHEN duplicate_object THEN
        RAISE NOTICE 'Constraint already exists (different name)';
END $$;

-- Verify the constraint was created correctly
SELECT 
    conname AS constraint_name,
    pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'work_logs'::regclass
AND conname = 'work_logs_status_check';

-- Show any rows that might violate the constraint (should be none)
SELECT id, status, child_id, project_id 
FROM work_logs 
WHERE status NOT IN ('pending', 'approved', 'declined');

