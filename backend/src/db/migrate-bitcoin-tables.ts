import { getSupabaseClient } from './supabase.js';
import { config } from '../config.js';

/**
 * Migrate Bitcoin tables - creates them if they don't exist
 * Uses direct PostgreSQL connection via pg library
 */
export async function migrateBitcoinTables(): Promise<boolean> {
  const supabase = getSupabaseClient();
  let migrated = false;

  // Check if bitcoin_price_cache table exists
  let priceCacheExists = false;
  try {
    const { error: checkError } = await supabase
      .from('bitcoin_price_cache')
      .select('id')
      .limit(1);

    if (!checkError) {
      priceCacheExists = true;
    } else if (!checkError.message.includes('relation') || !checkError.message.includes('does not exist')) {
      throw checkError;
    }
  } catch (error: any) {
    if (error?.message && error.message.includes('relation') && error.message.includes('does not exist')) {
      priceCacheExists = false;
    } else {
      console.error('Error checking bitcoin_price_cache table:', error);
      throw error;
    }
  }

  // Check if bitcoin_conversions table exists
  let conversionsExists = false;
  try {
    const { error: checkError } = await supabase
      .from('bitcoin_conversions')
      .select('id')
      .limit(1);

    if (!checkError) {
      conversionsExists = true;
    } else if (!checkError.message.includes('relation') || !checkError.message.includes('does not exist')) {
      throw checkError;
    }
  } catch (error: any) {
    if (error?.message && error.message.includes('relation') && error.message.includes('does not exist')) {
      conversionsExists = false;
    } else {
      console.error('Error checking bitcoin_conversions table:', error);
      throw error;
    }
  }

  // Check if point_id column exists in bitcoin_conversions (for existing tables)
  let pointIdColumnExists = false;
  if (conversionsExists) {
    try {
      // Try to query with point_id to see if column exists
      const { error: columnCheckError } = await supabase
        .from('bitcoin_conversions')
        .select('point_id')
        .limit(1);
      
      if (!columnCheckError) {
        pointIdColumnExists = true;
      }
    } catch {
      // Column doesn't exist
      pointIdColumnExists = false;
    }
  }

  // If both tables exist and point_id column exists, no migration needed
  if (priceCacheExists && conversionsExists && pointIdColumnExists) {
    return false;
  }

  // Try to create tables using pg library
  let pg: any = null;
  try {
    // Dynamic import to avoid TypeScript error if pg is not installed
    pg = await import('pg' as string);
  } catch (error) {
    // pg not available, will use fallback
    console.warn('pg library not available, cannot auto-create tables');
    pg = null;
  }

  const sqlStatements: string[] = [];

  if (!priceCacheExists) {
    console.log('Creating bitcoin_price_cache table...');
    sqlStatements.push(`
      CREATE TABLE IF NOT EXISTS bitcoin_price_cache (
        id BIGSERIAL PRIMARY KEY,
        price_usd NUMERIC NOT NULL,
        fetched_at TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    sqlStatements.push(`
      CREATE INDEX IF NOT EXISTS idx_bitcoin_price_cache_fetched_at ON bitcoin_price_cache(fetched_at);
    `);
    migrated = true;
  }

  if (!conversionsExists) {
    console.log('Creating bitcoin_conversions table...');
    sqlStatements.push(`
      CREATE TABLE IF NOT EXISTS bitcoin_conversions (
        id BIGSERIAL PRIMARY KEY,
        child_id BIGINT NOT NULL,
        point_id BIGINT,
        bonus_points_converted INTEGER NOT NULL,
        satoshis BIGINT NOT NULL,
        btc_amount NUMERIC NOT NULL,
        usd_value NUMERIC NOT NULL,
        price_usd NUMERIC NOT NULL,
        price_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
        parent_id BIGINT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE,
        FOREIGN KEY (point_id) REFERENCES points(id) ON DELETE CASCADE,
        FOREIGN KEY (parent_id) REFERENCES users(id) ON DELETE SET NULL
      );
    `);
    sqlStatements.push(`
      CREATE INDEX IF NOT EXISTS idx_bitcoin_conversions_child_id ON bitcoin_conversions(child_id);
    `);
    sqlStatements.push(`
      CREATE INDEX IF NOT EXISTS idx_bitcoin_conversions_parent_id ON bitcoin_conversions(parent_id);
    `);
    sqlStatements.push(`
      CREATE INDEX IF NOT EXISTS idx_bitcoin_conversions_created_at ON bitcoin_conversions(created_at);
    `);
    migrated = true;
  }

  // Add point_id column if table exists but column doesn't
  if (conversionsExists && !pointIdColumnExists) {
    console.log('Adding point_id column to bitcoin_conversions table...');
    sqlStatements.push(`
      ALTER TABLE bitcoin_conversions 
      ADD COLUMN IF NOT EXISTS point_id BIGINT,
      ADD CONSTRAINT IF NOT EXISTS fk_bitcoin_conversions_point_id 
      FOREIGN KEY (point_id) REFERENCES points(id) ON DELETE CASCADE;
    `);
    migrated = true;
  }

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
        console.log('Bitcoin tables created successfully');
        return migrated;
      } catch (error) {
        console.warn('Failed to create tables via direct PostgreSQL connection:', error);
        // Fall through to error message
      }
    }

    // Fallback: log instructions
    console.warn('⚠️  Could not automatically create Bitcoin tables.');
    console.warn('   Please run this SQL in Supabase SQL editor:');
    console.warn('   File: backend/src/db/schema-postgres-supabase.sql');
    console.warn('   Or run these statements:');
    sqlStatements.forEach((sql, i) => {
      console.warn(`   ${i + 1}. ${sql.trim()}`);
    });
    return false;
  }

  return migrated;
}

/**
 * Clean up orphaned Bitcoin conversions (those with NULL point_id)
 * These are from before we added point_id validation
 */
export async function cleanupOrphanedConversions(): Promise<number> {
  const supabase = getSupabaseClient();
  
  try {
    // Find all conversions with NULL point_id
    const { data: orphaned, error: findError } = await supabase
      .from('bitcoin_conversions')
      .select('id, child_id, created_at, satoshis')
      .is('point_id', null);
    
    if (findError) {
      console.error('Error finding orphaned conversions:', findError);
      return 0;
    }
    
    if (!orphaned || orphaned.length === 0) {
      return 0;
    }
    
    console.log(`Found ${orphaned.length} orphaned Bitcoin conversion(s) with NULL point_id. Cleaning up...`);
    
    // Delete orphaned conversions
    const { error: deleteError } = await supabase
      .from('bitcoin_conversions')
      .delete()
      .is('point_id', null);
    
    if (deleteError) {
      console.error('Error deleting orphaned conversions:', deleteError);
      return 0;
    }
    
    console.log(`✓ Cleaned up ${orphaned.length} orphaned Bitcoin conversion(s)`);
    orphaned.forEach((conv) => {
      console.log(`  - Deleted conversion ID ${conv.id} (child ${conv.child_id}, ${conv.satoshis} satoshis, created ${conv.created_at})`);
    });
    
    return orphaned.length;
  } catch (error) {
    console.error('Error during orphaned conversion cleanup:', error);
    return 0;
  }
}

