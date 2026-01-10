import { initSupabaseConnection, getSupabaseClient } from './supabase.js';
import { seedDatabase } from './seed-supabase.js';
import { migrateBitcoinTables, cleanupOrphanedConversions } from './migrate-bitcoin-tables.js';

/**
 * Migrate work_logs table - creates it if it doesn't exist
 */
async function migrateWorkLogsTable(): Promise<boolean> {
  const supabase = getSupabaseClient();
  
  // Check if work_logs table exists
  let workLogsExists = false;
  try {
    const { error: checkError } = await supabase
      .from('work_logs')
      .select('id')
      .limit(1);

    if (!checkError) {
      workLogsExists = true;
      return false; // Table already exists, no migration needed
    } else if (!checkError.message.includes('relation') && !checkError.message.includes('does not exist')) {
      throw checkError;
    }
  } catch (error: any) {
    if (error?.message && (error.message.includes('relation') || error.message.includes('does not exist'))) {
      workLogsExists = false;
    } else {
      console.error('Error checking work_logs table:', error);
      throw error;
    }
  }

  // If table exists, no migration needed
  if (workLogsExists) {
    return false;
  }

  // Try to create table using pg library
  let pg: any = null;
  try {
    // Dynamic import to avoid TypeScript error if pg is not installed
    pg = await import('pg' as string);
  } catch (error) {
    // pg not available, will use fallback
    console.warn('pg library not available, cannot auto-create work_logs table');
    pg = null;
  }

  const sqlStatements: string[] = [];

  console.log('Creating work_logs table...');
  sqlStatements.push(`
    CREATE TABLE IF NOT EXISTS work_logs (
      id BIGSERIAL PRIMARY KEY,
      child_id BIGINT NOT NULL,
      hours NUMERIC NOT NULL CHECK(hours > 0),
      description TEXT NOT NULL,
      work_date DATE NOT NULL DEFAULT CURRENT_DATE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE
    );
  `);
  sqlStatements.push(`
    CREATE INDEX IF NOT EXISTS idx_work_logs_child_id ON work_logs(child_id);
  `);
  sqlStatements.push(`
    CREATE INDEX IF NOT EXISTS idx_work_logs_work_date ON work_logs(work_date);
  `);
  sqlStatements.push(`
    CREATE INDEX IF NOT EXISTS idx_work_logs_created_at ON work_logs(created_at);
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
        console.log('work_logs table created successfully');
        return true;
      } catch (error) {
        console.warn('Failed to create work_logs table via direct PostgreSQL connection:', error);
        // Fall through to error message
      }
    }

    // Fallback: log instructions
    console.warn('⚠️  Could not automatically create work_logs table.');
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

export async function initDatabase() {
  console.log('Initializing Supabase database...');
  
  try {
    await initSupabaseConnection();
    const supabase = getSupabaseClient();
    
    // Check if houses table exists and has data
    const { data: houses, error: housesError } = await supabase
      .from('houses')
      .select('id')
      .limit(1);
    
    if (housesError) {
      // Table might not exist - this is OK, user needs to run schema
      if (housesError.code === 'PGRST116' || housesError.message.includes('relation') || housesError.message.includes('does not exist')) {
        console.warn('⚠️  Database tables not found. Please run the PostgreSQL schema in your Supabase SQL editor:');
        console.warn('   File: backend/src/db/schema-postgres-supabase.sql');
        console.warn('   Or create tables manually in Supabase dashboard.');
        return;
      }
      throw housesError;
    }
    
    console.log('Database connection successful');
    
    // Migrate Bitcoin tables if they don't exist
    try {
      await migrateBitcoinTables();
    } catch (error) {
      console.warn('Bitcoin table migration failed (non-critical):', error);
      // Don't throw - allow app to continue even if Bitcoin tables don't exist yet
    }
    
    // Migrate work_logs table if it doesn't exist
    try {
      await migrateWorkLogsTable();
    } catch (error) {
      console.warn('Work logs table migration failed (non-critical):', error);
      // Don't throw - allow app to continue even if work_logs table doesn't exist yet
    }
    
    // Clean up orphaned conversions (those with NULL point_id)
    // This handles conversions created before we added point_id validation
    // Run this separately so it always runs, even if migration failed
    try {
      await cleanupOrphanedConversions();
    } catch (error) {
      console.warn('Orphaned conversion cleanup failed (non-critical):', error);
      if (error instanceof Error) {
        console.warn('Cleanup error details:', error.message, error.stack);
      }
    }
    
    // Check if database is empty and seed if needed
    const houseCount = houses?.length || 0;
    
    if (houseCount === 0) {
      console.log('Database is empty, seeding data...');
      await seedDatabase();
      console.log('Seed data created');
    } else {
      console.log('Database already contains data, skipping seed');
    }
  } catch (error) {
    console.error('Failed to initialize database:', error);
    throw error;
  }
}



