import dotenv from 'dotenv';

dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';
const supabaseUrl = process.env.SUPABASE_URL || (!isProduction ? 'https://qusvfeposzfmhggrvots.supabase.co' : undefined);
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || (!isProduction ? 'sb_publishable_PonqAiHcIragHdun58jMxg_bZXwWo5w' : undefined);

if (isProduction && (!supabaseUrl || !supabaseAnonKey)) {
  console.error('In production, SUPABASE_URL and SUPABASE_ANON_KEY (or SUPABASE_PUBLISHABLE_KEY) must be set.');
  console.error('Set them in Render Dashboard → your service → Environment.');
  process.exit(1);
}

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databasePath: process.env.DATABASE_PATH || './data/family-app.db',
  choresDatabaseUrl: process.env.CHORES_DATABASE_URL || 'file:./data/chores.db',
  supabase: {
    url: supabaseUrl!,
    anonKey: supabaseAnonKey!,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || undefined,
  },
};





