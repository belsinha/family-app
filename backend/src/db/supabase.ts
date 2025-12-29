import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config.js';

let supabase: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!supabase) {
    // Use service role key if available for server-side operations
    // Otherwise fall back to anon key
    const apiKey = config.supabase.serviceRoleKey || config.supabase.anonKey;
    
    supabase = createClient(config.supabase.url, apiKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  
  return supabase;
}

export async function initSupabaseConnection(): Promise<SupabaseClient> {
  const client = getSupabaseClient();
  
  // Test the connection
  try {
    const { error } = await client.from('houses').select('count').limit(1);
    if (error && error.code !== 'PGRST116') { // PGRST116 is "relation does not exist" which is OK for first run
      console.warn('Supabase connection test warning:', error.message);
    }
  } catch (error) {
    console.warn('Supabase connection test failed:', error);
  }
  
  return client;
}


