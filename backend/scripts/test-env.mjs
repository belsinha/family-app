// Test-only placeholders. Route tests mock all Supabase I/O; these merely let config modules load
// in clean checkouts without reading a developer's real credentials.
process.env.SUPABASE_URL ||= 'https://fake-test-project.supabase.co';
process.env.SUPABASE_ANON_KEY ||= 'fake-test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'fake-test-service-role-key';
process.env.CHORES_HOUSE_ID ||= '1';
process.env.CHORES_SKIP_MIGRATE_ON_START ||= '1';
