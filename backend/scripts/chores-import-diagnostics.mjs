// Never inspect messages, detail, SQL, parameters, URLs, stacks or nested errors.
const permittedCodes = new Set(['ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET',
  'SELF_SIGNED_CERT_IN_CHAIN', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'CERT_HAS_EXPIRED', 'ERR_TLS_CERT_ALTNAME_INVALID', '28P01', '28000', '42501',
  '42P01', '42703', '23503', '23505', '23514', '40001', '40P01', '57014', '08006']);
export function safeErrorCode(error) {
  const code = error?.code;
  return typeof code === 'string' && permittedCodes.has(code) ? code : 'UNCLASSIFIED';
}
export function queryStage(sql) {
  if (sql.startsWith('BEGIN')) return 'transaction_begin';
  if (sql.startsWith('LOCK TABLE')) return 'target_lock';
  if (sql.startsWith('SELECT id FROM public.houses')) return 'house_check';
  if (sql.startsWith('SELECT count(*)')) return 'empty_target_check';
  if (sql.startsWith('INSERT INTO chores."StoreMetadata"')) return 'completion_marker';
  if (sql.startsWith('INSERT')) return 'insert_rows';
  if (sql.startsWith('ALTER SEQUENCE')) return 'sequence_reconcile';
  if (sql.startsWith('COMMIT')) return 'commit';
  return 'row_reconcile';
}
