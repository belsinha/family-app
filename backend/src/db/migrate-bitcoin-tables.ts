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
    // First add the column
    sqlStatements.push(`
      ALTER TABLE bitcoin_conversions 
      ADD COLUMN IF NOT EXISTS point_id BIGINT;
    `);
    // Then add the foreign key constraint (separate statement because PostgreSQL doesn't support IF NOT EXISTS for constraints in same statement)
    sqlStatements.push(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint 
          WHERE conname = 'fk_bitcoin_conversions_point_id'
        ) THEN
          ALTER TABLE bitcoin_conversions 
          ADD CONSTRAINT fk_bitcoin_conversions_point_id 
          FOREIGN KEY (point_id) REFERENCES points(id) ON DELETE CASCADE;
        END IF;
      END $$;
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
    console.log('[CLEANUP] Starting orphaned Bitcoin conversion cleanup...');
    
    // First check if point_id column exists
    const { data: testQuery, error: columnCheckError } = await supabase
      .from('bitcoin_conversions')
      .select('point_id')
      .limit(1);
    
    if (columnCheckError) {
      // Column doesn't exist - can't clean up orphaned conversions
      if (columnCheckError.message.includes('column') && columnCheckError.message.includes('does not exist')) {
        console.log('[CLEANUP] point_id column does not exist yet. Run migration first to add it.');
        return 0;
      }
      // Some other error
      console.error('[CLEANUP] Error checking for point_id column:', columnCheckError);
      return 0;
    }
    
    // Find all conversions with NULL point_id
    const { data: orphaned, error: findError } = await supabase
      .from('bitcoin_conversions')
      .select('id, child_id, created_at, satoshis, point_id')
      .is('point_id', null);
    
    if (findError) {
      console.error('[CLEANUP] Error finding orphaned conversions:', findError);
      console.error('[CLEANUP] Error details:', JSON.stringify(findError, null, 2));
      return 0;
    }
    
    console.log(`[CLEANUP] Query result: ${orphaned?.length || 0} orphaned conversion(s) found`);
    
    if (!orphaned || orphaned.length === 0) {
      console.log('[CLEANUP] No orphaned conversions to clean up');
      return 0;
    }
    
    console.log(`[CLEANUP] Found ${orphaned.length} orphaned Bitcoin conversion(s) with NULL point_id:`);
    orphaned.forEach((conv) => {
      console.log(`  - Conversion ID ${conv.id} (child ${conv.child_id}, ${conv.satoshis} satoshis, created ${conv.created_at}, point_id: ${conv.point_id})`);
    });
    
    // Delete by IDs for more reliable deletion
    const idsToDelete = orphaned.map(conv => conv.id);
    console.log(`[CLEANUP] Attempting to delete ${idsToDelete.length} conversion(s) with IDs:`, idsToDelete);
    
    // Delete orphaned conversions by IDs
    const { data: deletedData, error: deleteError } = await supabase
      .from('bitcoin_conversions')
      .delete()
      .in('id', idsToDelete)
      .select();
    
    if (deleteError) {
      console.error('[CLEANUP] Error deleting orphaned conversions:', deleteError);
      console.error('[CLEANUP] Delete error details:', JSON.stringify(deleteError, null, 2));
      
      // Try alternative method: delete one by one
      console.log('[CLEANUP] Attempting alternative deletion method (one by one)...');
      let deletedCount = 0;
      for (const id of idsToDelete) {
        const { error: singleDeleteError } = await supabase
          .from('bitcoin_conversions')
          .delete()
          .eq('id', id);
        
        if (singleDeleteError) {
          console.error(`[CLEANUP] Failed to delete conversion ID ${id}:`, singleDeleteError);
        } else {
          deletedCount++;
          console.log(`[CLEANUP] ✓ Deleted conversion ID ${id}`);
        }
      }
      
      if (deletedCount > 0) {
        console.log(`[CLEANUP] ✓ Cleaned up ${deletedCount} of ${idsToDelete.length} orphaned conversion(s)`);
        return deletedCount;
      }
      
      return 0;
    }
    
    const deletedCount = deletedData?.length || 0;
    console.log(`[CLEANUP] ✓ Successfully cleaned up ${deletedCount} orphaned Bitcoin conversion(s)`);
    
    return deletedCount;
  } catch (error) {
    console.error('[CLEANUP] Error during orphaned conversion cleanup:', error);
    if (error instanceof Error) {
      console.error('[CLEANUP] Error stack:', error.stack);
    }
    return 0;
  }
}

