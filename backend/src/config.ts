import dotenv from 'dotenv';
import { loadBitcoinWalletConfig } from './bitcoinWalletConfig.js';
import { parseAllowedOrigins } from './corsOrigins.js';
import {
  DEV_ONLY_JWT_SECRET,
  collectProductionStartupProblems,
  formatProductionStartupProblems,
} from './startupSecurityGate.js';

dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;

// No hardcoded fallback: every environment (including local dev) must supply its own Supabase
// project credentials. See backend/.env.example / backend/SUPABASE_SETUP.md.
if (!supabaseUrl || !supabaseAnonKey) {
  console.error('SUPABASE_URL and SUPABASE_ANON_KEY (or SUPABASE_PUBLISHABLE_KEY) must be set.');
  if (isProduction) {
    console.error('Set them in Render Dashboard → your service → Environment.');
  } else {
    console.error('Copy backend/.env.example to backend/.env and fill in your own Supabase project credentials.');
  }
  process.exit(1);
}

const jwtSecretEnv = process.env.JWT_SECRET;

if (!jwtSecretEnv && !isProduction) {
  console.warn('JWT_SECRET not set — using an insecure dev-only default. Set JWT_SECRET in backend/.env for real use.');
}

// Production startup security gate: refuses to boot on a weak/placeholder JWT_SECRET, a
// placeholder-looking Supabase URL/key, a missing CORS allowlist, or a database path that would
// silently lose data on redeploy. See startupSecurityGate.ts for the full rule set, and
// db/productionCredentialCheck.ts for the companion check against live account passwords.
if (isProduction) {
  const problems = collectProductionStartupProblems(process.env);
  if (problems.length > 0) {
    console.error(formatProductionStartupProblems(problems));
    process.exit(1);
  }
}

function parseBcryptCost(): number {
  const raw = parseInt(process.env.BCRYPT_COST || '', 10);
  if (Number.isFinite(raw) && raw >= 10 && raw <= 15) return raw;
  return 12;
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

const corsAllowedOrigins = Array.from(
  new Set([
    ...parseAllowedOrigins(process.env.ALLOWED_ORIGINS),
    ...(trimTrailingSlash(process.env.PUBLIC_APP_ORIGIN) ? [trimTrailingSlash(process.env.PUBLIC_APP_ORIGIN)!] : []),
  ])
);

const keepAliveBaseUrl =
  trimTrailingSlash(process.env.KEEP_ALIVE_URL) ?? trimTrailingSlash(process.env.RENDER_EXTERNAL_URL) ?? null;
const keepAliveIntervalParsed = parseInt(process.env.KEEP_ALIVE_INTERVAL_MS || '600000', 10);
const keepAliveIntervalMs =
  Number.isFinite(keepAliveIntervalParsed) && keepAliveIntervalParsed > 0 ? keepAliveIntervalParsed : 600_000;

let bitcoinWallet: ReturnType<typeof loadBitcoinWalletConfig>;
try {
  bitcoinWallet = loadBitcoinWalletConfig(process.env);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Invalid Bitcoin wallet configuration.');
  process.exit(1);
}

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction,
  databasePath: process.env.DATABASE_PATH || './data/family-app.db',
  choresDatabaseUrl: process.env.CHORES_DATABASE_URL || 'file:./data/chores.db',
  chores: {
    // The Prisma/SQLite chores database represents exactly one Supabase house.
    houseId: Number.parseInt(process.env.CHORES_HOUSE_ID || '1', 10),
  },
  jwt: {
    secret: jwtSecretEnv || DEV_ONLY_JWT_SECRET,
    // Parent/family (admin-equivalent) accounts: short-lived in production so a leaked token
    // has a small window of use. Longer in dev for convenience.
    expiresIn: process.env.JWT_EXPIRES_IN || (isProduction ? '12h' : '7d'),
    // Child accounts: kept long-lived in every environment on purpose — kids re-authing every
    // half day is a real UX cost for a low-privilege account, so we don't shorten this in prod.
    childExpiresIn: process.env.JWT_CHILD_EXPIRES_IN || '7d',
  },
  security: {
    bcryptCost: parseBcryptCost(),
  },
  supabase: {
    url: supabaseUrl!,
    anonKey: supabaseAnonKey!,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || undefined,
  },
  bitcoin: {
    network: (process.env.BITCOIN_NETWORK || 'testnet') as 'mainnet' | 'testnet',
    ...bitcoinWallet,
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
  cors: {
    // Exact-match allowlist from ALLOWED_ORIGINS (comma-separated) plus PUBLIC_APP_ORIGIN.
    allowedOrigins: corsAllowedOrigins,
    // Any http(s)://localhost|127.0.0.1|[::1]:<port> is allowed outside production so local
    // dev (Vite on a random port, etc.) doesn't need every port added to the allowlist.
    allowLocalhost: !isProduction,
  },
};





