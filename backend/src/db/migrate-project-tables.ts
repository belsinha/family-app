import { getSupabaseClient } from './supabase.js';

/**
 * Migrate projects table - creates it if it doesn't exist
 */
export async function migrateProjectsTable(): Promise<boolean> {
  const supabase = getSupabaseClient();
  
  // Check if projects table exists
  let projectsExists = false;
  try {
    const { error: checkError } = await supabase
      .from('projects')
      .select('id')
      .limit(1);

    if (!checkError) {
      projectsExists = true;
      return false; // Table already exists, no migration needed
    } else {
      // Check for various table-not-found error messages
      const errorMsg = checkError.message?.toLowerCase() || '';
      const errorCode = checkError.code || '';
      if (
        errorMsg.includes('relation') || 
        errorMsg.includes('does not exist') ||
        errorMsg.includes('could not find the table') ||
        errorMsg.includes('schema cache') ||
        errorCode === 'PGRST116' ||
        errorCode === '42P01'
      ) {
        projectsExists = false;
      } else {
        throw checkError;
      }
    }
  } catch (error: any) {
    if (error?.message) {
      const errorMsg = error.message.toLowerCase();
      if (
        errorMsg.includes('relation') || 
        errorMsg.includes('does not exist') ||
        errorMsg.includes('could not find the table') ||
        errorMsg.includes('schema cache') ||
        error?.code === 'PGRST116' ||
        error?.code === '42P01'
      ) {
        projectsExists = false;
      } else {
        console.error('Error checking projects table:', error);
        throw error;
      }
    } else {
      console.error('Error checking projects table:', error);
      throw error;
    }
  }

  // If table exists, no migration needed
  if (projectsExists) {
    return false;
  }

  // Try to create table using pg library
  let pg: any = null;
  try {
    // Dynamic import to avoid TypeScript error if pg is not installed
    pg = await import('pg' as string);
  } catch (error) {
    // pg not available, will use fallback
    console.warn('pg library not available, cannot auto-create projects table');
    pg = null;
  }

  const sqlStatements: string[] = [];

  console.log('Creating projects table...');
  sqlStatements.push(`
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
  `);
  sqlStatements.push(`
    CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
  `);
  sqlStatements.push(`
    CREATE INDEX IF NOT EXISTS idx_projects_start_date ON projects(start_date);
  `);

  // Execute SQL if we have statements to run
  if (sqlStatements.length > 0) {
    // Try to use pg library if available and connection string is provided
    const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
    
    if (pg && dbUrl) {
      try {
        const { Pool } = pg;
        const pool = new Pool({
          connectionString: dbUrl,
          ssl: dbUrl.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
        });

        for (const sql of sqlStatements) {
          await pool.query(sql);
        }

        await pool.end();
        console.log('projects table created successfully');
        return true;
      } catch (error) {
        console.warn('Failed to create projects table via direct PostgreSQL connection:', error);
        // Fall through to error message
      }
    }

    // Fallback: log instructions
    console.warn('⚠️  Could not automatically create projects table.');
    console.warn('   Please run this SQL in Supabase SQL editor:');
    console.warn('   File: backend/src/db/schema-postgres-supabase.sql');
    console.warn('   Or run these statements:');
    sqlStatements.forEach((sql, i) => {
      console.warn(`   ${i + 1}. ${sql.trim()}`);
    });
    return false;
  }

  return false;
}

/**
 * Migrate work_logs table to add project_id and status columns
 */
export async function migrateWorkLogsForProjects(): Promise<boolean> {
  const supabase = getSupabaseClient();
  
  // First check if projects table exists
  try {
    const { error: projectsError } = await supabase
      .from('projects')
      .select('id')
      .limit(1);
    
    if (projectsError) {
      console.warn('⚠️  projects table does not exist. Please create it first.');
      return false;
    }
  } catch (error) {
    console.warn('⚠️  Cannot check projects table. Please ensure it exists.');
    return false;
  }

  // Check if work_logs table exists
  let workLogsExists = false;
  try {
    const { error: checkError } = await supabase
      .from('work_logs')
      .select('id, project_id, status')
      .limit(1);

    if (!checkError) {
      // Table exists, check if columns exist
      workLogsExists = true;
      // Try to select project_id to see if column exists
      const { error: projectIdError } = await supabase
        .from('work_logs')
        .select('project_id')
        .limit(1);
      
      if (projectIdError) {
        // Column doesn't exist, need to add it
        workLogsExists = false;
      } else {
        // Columns already exist
        return false;
      }
    } else {
      const errorMsg = checkError.message?.toLowerCase() || '';
      const errorCode = checkError.code || '';
      if (
        errorMsg.includes('column') && errorMsg.includes('project_id') ||
        errorMsg.includes('column') && errorMsg.includes('status')
      ) {
        // Table exists but columns are missing
        workLogsExists = true;
      } else if (
        errorMsg.includes('relation') || 
        errorMsg.includes('does not exist') ||
        errorMsg.includes('could not find the table') ||
        errorMsg.includes('schema cache') ||
        errorCode === 'PGRST116' ||
        errorCode === '42P01'
      ) {
        // Table doesn't exist at all - will be created by migrateWorkLogsTable
        console.warn('⚠️  work_logs table does not exist. It will be created with new schema.');
        return false;
      } else {
        throw checkError;
      }
    }
  } catch (error: any) {
    if (error?.message) {
      const errorMsg = error.message.toLowerCase();
      if (
        errorMsg.includes('column') && errorMsg.includes('project_id') ||
        errorMsg.includes('column') && errorMsg.includes('status')
      ) {
        workLogsExists = true;
      } else {
        console.error('Error checking work_logs table:', error);
        throw error;
      }
    } else {
      console.error('Error checking work_logs table:', error);
      throw error;
    }
  }

  // If table doesn't exist, it will be created with new schema elsewhere
  if (!workLogsExists) {
    return false;
  }

  // Try to create columns using pg library
  let pg: any = null;
  try {
    pg = await import('pg' as string);
  } catch (error) {
    console.warn('pg library not available, cannot auto-migrate work_logs table');
    pg = null;
  }

  const sqlStatements: string[] = [];

  console.log('Migrating work_logs table to add project_id and status...');
  
  // Create a default project if needed (for existing work logs)
  sqlStatements.push(`
    INSERT INTO projects (name, description, start_date, bonus_rate, status)
    SELECT 
      'Default Project',
      'Default project for migrated work logs',
      CURRENT_DATE,
      1.0,
      'inactive'
    WHERE NOT EXISTS (SELECT 1 FROM projects WHERE name = 'Default Project');
  `);
  
  // Add columns if they don't exist
  sqlStatements.push(`
    DO $$ 
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='work_logs' AND column_name='project_id') THEN
        ALTER TABLE work_logs ADD COLUMN project_id BIGINT;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='work_logs' AND column_name='status') THEN
        ALTER TABLE work_logs ADD COLUMN status TEXT CHECK(status IN ('pending', 'approved', 'declined')) DEFAULT 'approved';
      END IF;
    END $$;
  `);
  
  // Update existing work logs to reference default project and set status
  sqlStatements.push(`
    UPDATE work_logs
    SET 
      project_id = (SELECT id FROM projects WHERE name = 'Default Project' LIMIT 1),
      status = 'approved'
    WHERE project_id IS NULL;
  `);
  
  // Now make project_id NOT NULL and add foreign key
  sqlStatements.push(`
    DO $$ 
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='work_logs' AND column_name='project_id' AND is_nullable='YES') THEN
        ALTER TABLE work_logs ALTER COLUMN project_id SET NOT NULL;
        ALTER TABLE work_logs ALTER COLUMN status SET NOT NULL;
        
        -- Drop existing foreign key if it exists
        IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_work_logs_project') THEN
          ALTER TABLE work_logs DROP CONSTRAINT fk_work_logs_project;
        END IF;
        
        -- Add foreign key
        ALTER TABLE work_logs
        ADD CONSTRAINT fk_work_logs_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT;
      END IF;
    END $$;
  `);
  
  // Create indexes
  sqlStatements.push(`
    CREATE INDEX IF NOT EXISTS idx_work_logs_project_id ON work_logs(project_id);
  `);
  sqlStatements.push(`
    CREATE INDEX IF NOT EXISTS idx_work_logs_status ON work_logs(status);
  `);

  // Execute SQL if we have statements to run
  if (sqlStatements.length > 0) {
    const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
    
    if (pg && dbUrl) {
      try {
        const { Pool } = pg;
        const pool = new Pool({
          connectionString: dbUrl,
          ssl: dbUrl.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
        });

        for (const sql of sqlStatements) {
          await pool.query(sql);
        }

        await pool.end();
        console.log('work_logs table migrated successfully');
        return true;
      } catch (error) {
        console.warn('Failed to migrate work_logs table via direct PostgreSQL connection:', error);
        // Fall through to error message
      }
    }

    // Fallback: log instructions
    console.warn('⚠️  Could not automatically migrate work_logs table.');
    console.warn('   Please run this SQL in Supabase SQL editor:');
    console.warn('   File: backend/src/db/migrate-project-work-logs.sql');
    return false;
  }

  return false;
}

