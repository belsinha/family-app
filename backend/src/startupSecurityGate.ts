import { parseAllowedOrigins } from './corsOrigins.js';

/**
 * Production-only startup gate over raw environment variables, run synchronously before the app
 * touches a socket or database. Complements db/productionCredentialCheck.ts, which checks live
 * account passwords *after* the DB connects — this gate checks env-level config before that.
 */

export const DEV_ONLY_JWT_SECRET = 'dev-only-insecure-secret-change-me';

const MIN_JWT_SECRET_LENGTH = 32;

// Catches the most common ways someone accidentally ships a placeholder: copying
// backend/.env.example verbatim, a doc's "changeme" example, or a dummy value from a tutorial.
const PLACEHOLDER_PATTERNS: RegExp[] = [
  /your[-_].*ref/i,
  /your[-_].*key/i,
  /change[-_]?me/i,
  /example\.com/i,
  /placeholder/i,
  /^(test|dummy|fake|secret|xxx+)$/i,
];

function looksLikePlaceholder(value: string): boolean {
  return PLACEHOLDER_PATTERNS.some((re) => re.test(value));
}

/** Flags a single repeated character or a string built from very few distinct characters
 *  (e.g. "abababababababababab...") — technically long enough, but not actually random. */
function hasLowEntropy(value: string): boolean {
  if (/^(.)\1*$/.test(value)) return true;
  return new Set(value).size < 4;
}

export function isWeakJwtSecret(secret: string): boolean {
  if (secret.length < MIN_JWT_SECRET_LENGTH) return true;
  if (secret === DEV_ONLY_JWT_SECRET) return true;
  if (looksLikePlaceholder(secret)) return true;
  if (hasLowEntropy(secret)) return true;
  return false;
}

/** A relative DB path is fine on a laptop but on Render (and most PaaS) it resolves inside the
 *  ephemeral app directory and is silently wiped on every deploy instead of living on the
 *  persistent disk — see render.yaml, which sets CHORES_DATABASE_URL as absolute for exactly this
 *  reason. Production requires an absolute path so this class of data-loss can't happen quietly. */
function isUnsafeRelativeProductionPath(rawPath: string): boolean {
  return !rawPath.startsWith('/');
}

export function collectProductionStartupProblems(env: NodeJS.ProcessEnv): string[] {
  const problems: string[] = [];

  const jwtSecret = env.JWT_SECRET;
  if (!jwtSecret) {
    problems.push('JWT_SECRET is not set.');
  } else if (isWeakJwtSecret(jwtSecret)) {
    problems.push(
      `JWT_SECRET is too weak — it must be a random string of at least ${MIN_JWT_SECRET_LENGTH} characters, ` +
        'not the dev placeholder, a known placeholder-looking value, or a low-entropy string. ' +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"'
    );
  }

  const supabaseUrl = env.SUPABASE_URL;
  const supabaseKey = env.SUPABASE_ANON_KEY || env.SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl) {
    problems.push('SUPABASE_URL is not set.');
  } else if (!/^https:\/\//i.test(supabaseUrl) || looksLikePlaceholder(supabaseUrl)) {
    problems.push(`SUPABASE_URL ("${supabaseUrl}") looks like a placeholder or is not a valid https:// URL.`);
  }
  if (!supabaseKey) {
    problems.push('SUPABASE_ANON_KEY (or SUPABASE_PUBLISHABLE_KEY) is not set.');
  } else if (looksLikePlaceholder(supabaseKey)) {
    problems.push('SUPABASE_ANON_KEY/SUPABASE_PUBLISHABLE_KEY looks like a placeholder value.');
  }

  // ALLOWED_ORIGINS is the intended production knob; PUBLIC_APP_ORIGIN (a single convenience
  // origin, folded into the same allowlist in config.ts) also satisfies this so deployments that
  // only set the latter aren't broken by this gate.
  const effectiveOriginCount =
    parseAllowedOrigins(env.ALLOWED_ORIGINS).length + (env.PUBLIC_APP_ORIGIN?.trim() ? 1 : 0);
  if (effectiveOriginCount === 0) {
    problems.push('ALLOWED_ORIGINS is not set (comma-separated list of allowed frontend origins; PUBLIC_APP_ORIGIN also counts).');
  }

  // CHORES_DATABASE_URL is the one DB path actually read on the server.ts boot path (Prisma/
  // chores). DATABASE_PATH (the legacy sql.js path) is wired into db/connection.ts but that module
  // is never imported by server.ts, so it's dead config today — deliberately not gated here; see
  // render.yaml's "DATABASE_PATH below is unused legacy config" comment.
  const choresUrl = env.CHORES_DATABASE_URL;
  if (!choresUrl || choresUrl.trim().length === 0) {
    problems.push('CHORES_DATABASE_URL is not set.');
  } else if (choresUrl.startsWith('file:')) {
    const filePath = choresUrl.slice('file:'.length);
    if (!filePath || isUnsafeRelativeProductionPath(filePath)) {
      problems.push(
        `CHORES_DATABASE_URL ("${choresUrl}") is a relative path — it will be wiped on every deploy unless ` +
          'it points at an absolute path on a persistent disk (see render.yaml).'
      );
    }
  }

  return problems;
}

export function formatProductionStartupProblems(problems: string[]): string {
  return [
    'Refusing to start in production: unsafe/incomplete configuration detected.',
    ...problems.map((p) => `  - ${p}`),
    'Fix these in the Render Dashboard → your service → Environment, then redeploy.',
  ].join('\n');
}
