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

function trimTrailingSlash(u: string | undefined): string | undefined {
  if (!u) return undefined;
  return u.replace(/\/$/, '');
}

/** Esplora base URL must be absolute (https://...); env is often pasted without a scheme. */
function normalizeEsploraBaseUrl(url: string): string {
  let u = url.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(u)) {
    u = `https://${u}`;
  }
  return u;
}

const keepAliveBaseUrl =
  trimTrailingSlash(process.env.KEEP_ALIVE_URL) ?? trimTrailingSlash(process.env.RENDER_EXTERNAL_URL) ?? null;
const keepAliveIntervalParsed = parseInt(process.env.KEEP_ALIVE_INTERVAL_MS || '600000', 10);
const keepAliveIntervalMs =
  Number.isFinite(keepAliveIntervalParsed) && keepAliveIntervalParsed > 0 ? keepAliveIntervalParsed : 600_000;

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
  bitcoin: {
    network: (process.env.BITCOIN_NETWORK || 'testnet') as 'mainnet' | 'testnet',
    mnemonic: process.env.BITCOIN_MNEMONIC || undefined,
    xprv: process.env.BITCOIN_XPRV || undefined,
    esploraBaseUrl: normalizeEsploraBaseUrl(
      process.env.ESPLORA_BASE_URL ||
        (process.env.BITCOIN_NETWORK === 'mainnet'
          ? 'https://blockstream.info/api'
          : 'https://blockstream.info/testnet/api'),
    ),
  },
  /** Ping public /health on an interval so Render (etc.) does not spin down from idle. */
  keepAlive: {
    enabled: process.env.KEEP_ALIVE_ENABLED !== 'false' && isProduction && keepAliveBaseUrl != null,
    baseUrl: keepAliveBaseUrl,
    intervalMs: keepAliveIntervalMs,
  },
};





