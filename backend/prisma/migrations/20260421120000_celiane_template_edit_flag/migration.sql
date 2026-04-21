-- Ensure Celiane can edit task templates regardless of auto-increment id.
-- (Seeds previously keyed editor permission only on id=1, which can miss a real Celiane row.)
UPDATE HouseholdMember SET canEditChores = 1 WHERE lower(trim(name)) IN ('celiane', 'rommel');
