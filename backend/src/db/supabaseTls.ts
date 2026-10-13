import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
// Official public Supabase CA, scoped to DB clients; never modifies system trust.
export const supabaseCaPath = fileURLToPath(new URL('../../certs/supabase-prod-ca-2021.crt', import.meta.url));
export function verifiedSupabaseCa(): string {
  const bytes = readFileSync(supabaseCaPath);
  if (createHash('sha256').update(bytes).digest('hex') !== '700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7')
    throw new Error('Supabase database CA integrity check failed');
  return bytes.toString('utf8');
}
function scopedUrl(value: string): URL | undefined {
  const url = new URL(value);
  return url.hostname.endsWith('.pooler.supabase.com') || /^db\.[a-z0-9]{20}\.supabase\.co$/.test(url.hostname) ? url : undefined;
}
function removeTlsParameters(url: URL) {
  for (const key of [...url.searchParams.keys()])
    if (key.startsWith('ssl') || key === 'uselibpqcompat') url.searchParams.delete(key);
}
export function supabasePgOptions(value: string) {
  const url = scopedUrl(value);
  if (!url) return { connectionString: value };
  removeTlsParameters(url);
  url.searchParams.delete('schema');
  return { connectionString: url.toString(), ssl: { ca: verifiedSupabaseCa(), rejectUnauthorized: true } };
}
export function supabasePrismaUrl(value: string): string {
  const url = scopedUrl(value);
  if (!url) return value;
  verifiedSupabaseCa();
  removeTlsParameters(url);
  url.searchParams.set('sslmode', 'require');
  url.searchParams.set('sslcert', supabaseCaPath);
  url.searchParams.set('sslaccept', 'strict');
  return url.toString();
}
