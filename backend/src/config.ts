import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databasePath: process.env.DATABASE_PATH || './data/family-app.db',
  supabase: {
    url: process.env.SUPABASE_URL || 'https://qusvfeposzfmhggrvots.supabase.co',
    // For server-side operations, use service role key if available
    // Otherwise, the anon/publishable key may work for some operations
    anonKey: process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_PonqAiHcIragHdun58jMxg_bZXwWo5w',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || undefined,
  },
};





