import { initSupabaseConnection, getSupabaseClient } from './supabase.js';
import { seedDatabase } from './seed-supabase.js';
import { migrateBitcoinTables, cleanupOrphanedConversions } from './migrate-bitcoin-tables.js';

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
      
      // Clean up orphaned conversions (those with NULL point_id)
      // This handles conversions created before we added point_id validation
      try {
        await cleanupOrphanedConversions();
      } catch (error) {
        console.warn('Orphaned conversion cleanup failed (non-critical):', error);
      }
    } catch (error) {
      console.warn('Bitcoin table migration failed (non-critical):', error);
      // Don't throw - allow app to continue even if Bitcoin tables don't exist yet
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



