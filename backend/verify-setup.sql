-- Quick verification queries to run in Supabase SQL Editor
-- These will help confirm your database is set up correctly

-- 1. Check if all tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('houses', 'users', 'children', 'points')
ORDER BY table_name;

-- 2. Check table structures
SELECT 
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('houses', 'users', 'children', 'points')
ORDER BY table_name, ordinal_position;

-- 3. Check if tables are empty (should return 0 for all if not seeded yet)
SELECT 
  'houses' as table_name, COUNT(*) as row_count FROM houses
UNION ALL
SELECT 
  'users' as table_name, COUNT(*) as row_count FROM users
UNION ALL
SELECT 
  'children' as table_name, COUNT(*) as row_count FROM children
UNION ALL
SELECT 
  'points' as table_name, COUNT(*) as row_count FROM points;



