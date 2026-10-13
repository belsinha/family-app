import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from 'pg';
import { supabasePgOptions, supabasePrismaUrl, verifiedSupabaseCa, supabaseCaPath } from './supabaseTls.js';
test('Supabase CA and strict TLS survive conflicting URL parameters in actual pg client', () => {
  const value = 'postgresql://test@aws-1-us-east-1.pooler.supabase.com:5432/postgres?schema=chores&sslmode=no-verify&sslaccept=accept_invalid_certs&sslrootcert=/missing&uselibpqcompat=true';
  const options = supabasePgOptions(value);
  assert.equal(options.ssl?.rejectUnauthorized, true);
  assert.equal(options.ssl?.ca, verifiedSupabaseCa());
  const pgUrl = new URL(options.connectionString);
  assert.equal(pgUrl.searchParams.has('sslmode'), false);
  assert.equal(pgUrl.searchParams.has('sslrootcert'), false);
  assert.equal(pgUrl.searchParams.has('uselibpqcompat'), false);
  const client = new Client(options);
  assert.deepEqual(client.ssl, options.ssl);
  const prisma = new URL(supabasePrismaUrl(value));
  assert.equal(prisma.searchParams.get('schema'), 'chores');
  assert.equal(prisma.searchParams.get('sslmode'), 'require');
  assert.equal(prisma.searchParams.get('sslaccept'), 'strict');
  assert.equal(prisma.searchParams.get('sslcert'), supabaseCaPath);
});
test('isolated local database settings remain unchanged', () => {
  const value = 'postgresql://postgres@127.0.0.1:5432/postgres?schema=chores';
  assert.deepEqual(supabasePgOptions(value), { connectionString: value });
  assert.equal(supabasePrismaUrl(value), value);
});
