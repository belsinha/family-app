import { getSupabaseClient } from './supabase.js';
import { comparePassword, COMMON_WEAK_PASSWORDS } from '../utils/auth.js';

const BYPASS_ENV = 'ALLOW_DEFAULT_CREDENTIALS';

/**
 * Production-only boot gate. Refuses to start (or, with an explicit override, warns loudly
 * instead) if:
 *   - no parent/admin account exists to administer the app, or
 *   - any account's password still matches a known demo/default value (a common weak password,
 *     or — for child accounts — the account's own name, which is the seed default outside
 *     production).
 *
 * This catches both a misconfigured fresh seed and a pre-existing prod database that was seeded
 * before this check existed. `ALLOW_DEFAULT_CREDENTIALS=true` downgrades it to a warning for one
 * boot so an already-seeded deployment can start, have its passwords changed via
 * POST /api/auth/change-password, and then have the override removed again.
 */
export async function assertProductionCredentialsAreSafe(): Promise<void> {
  const supabase = getSupabaseClient();
  const { data: users, error } = await supabase.from('users').select('id, name, role, password_hash');

  if (error) {
    throw new Error(`Startup credential check failed to query users: ${error.message}`);
  }

  const problems: string[] = [];

  const parentCount = (users ?? []).filter((u) => u.role === 'parent').length;
  if (parentCount === 0) {
    problems.push('No parent/admin account exists — setup is incomplete.');
  }

  for (const user of users ?? []) {
    if (!user.password_hash) continue;

    const candidates = new Set(COMMON_WEAK_PASSWORDS);
    if (user.role === 'child') candidates.add(String(user.name).toLowerCase());

    for (const candidate of candidates) {
      if (await comparePassword(candidate, user.password_hash)) {
        problems.push(`User "${user.name}" (${user.role}) is using a known demo/default password.`);
        break;
      }
    }
  }

  if (problems.length === 0) return;

  const message = [
    'Refusing to start in production: demo/default credentials or incomplete setup detected.',
    ...problems.map((p) => `  - ${p}`),
    'Log in and change every affected password via "Change Password" (POST /api/auth/change-password)',
    'before relaunching. To unblock a one-time boot for remediation only, set',
    `${BYPASS_ENV}=true, fix the passwords, then remove the override again.`,
  ].join('\n');

  if (process.env[BYPASS_ENV] === 'true') {
    console.warn(`⚠️  ${message}`);
    return;
  }

  throw new Error(message);
}
