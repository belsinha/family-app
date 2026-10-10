# Manual task bonus and demerit tracking

This API records the parent's explicit decision and supplied quantity. It does not choose an award, infer a penalty from task status, change a task's completion status, fetch prices, create Bitcoin conversions, trade, sign or broadcast a transaction, or record a payout. Task entries contribute to the child's points totals and history, but are excluded from legacy Bitcoin balances, conversion eligibility and available payout credits. Existing legacy points retain their existing accounting behavior.

## Activation and rollback

The endpoints are disabled by default. The Git integration is prepared with `[skip render]`; it is not a production deployment.

Before activation, verify the actual Render service's repository, deployed commit, environment and persistent chores database. Back up both the Supabase database and chores database privately. Test `supabase/migrations/20261010201518_task_point_tracking.sql` on an isolated copy; deploy that migration once through the existing reviewed database migration workflow. The migration extends the existing Supabase `points` ledger and `children` records; it does not migrate the separate Prisma SQLite database or grant browser access to either table. Existing rows remain `source=legacy`.

The updated balance implementation requires this migration before the build is deployed: if columns are absent, balance reads fail closed rather than returning a potentially financial total. After migration, set `TASK_POINT_SCHEMA_READY=true` and then `TASK_POINT_TRACKING_ENABLED=true` to allow new task writes and mappings. To stop new task writes, set `TASK_POINT_TRACKING_ENABLED=false`. Balance filtering is unconditional and remains safe even if either flag is unset. Do not drop columns or deploy an older balance implementation after task entries exist. Verify this on the isolated database before any production change.

`CHORES_HOUSE_ID` must identify the Supabase house represented by this single-house SQLite database. The backend uses its existing service-role connection behind its existing authentication and house authorization; no new credentials, permissions or assistant service account are provisioned. New task rows cannot be hard-deleted, including by cascading a child deletion; retention operations need a separately reviewed audit-preservation policy.

## Parent-authenticated API

Use the existing parent Bearer session. Children and family accounts cannot write. Do not share session tokens in chat, logs or example files. Assistant integration uses this same scoped API only with the parent's authorized existing session; there is no privileged bypass.

1. Read `/api/children`, `/api/household-members` and `/api/tasks` through their existing authenticated endpoints. Select the exact child and corresponding household member. IDs from the two databases are unrelated; names are not an authorization or matching rule.
2. `PUT /api/children/{childId}/chore-member`, body `{ "householdMemberId": <selected integer> }`, records the parent's explicit association. The member must exist in this house's SQLite database and cannot already be linked to another child in the same house.
3. `POST /api/points/task`, body fields: `childId`, `taskInstanceId`, `type` (`bonus` or `demerit`), `points` (the positive integer supplied by the parent), `reason` (the parent's nonempty explanation, up to 2,000 characters), and `requestId` (a UUID for this one explicit decision). The task must be assigned to the child's linked household member. Unassigned tasks are not attributed by guessing.
4. Save and reuse the same requestId and body when retrying. A new row returns 201 with `{ point, replayed: false }`; a matching retry returns 200 with the original row and `replayed: true`. Reusing the key with changed intent returns 409. The database unique index also protects concurrent requests. Intentionally separate parent decisions use separate keys; no automatic one-award-per-task rule is invented.
5. Read the existing `/api/points/child/{childId}` history and `/balance` totals. Each task entry retains the task name/date/member snapshot, original actor ID, original reason and request fingerprint. A retry survives later task rename/deletion and does not reactivate a voided row. Child reads remain restricted to self.
6. Correct an entry with `POST /api/points/{pointId}/void`, body `{ "reason": <parent explanation> }`. The original intent remains immutable; the void actor/time/reason are retained, and the row is excluded from totals. The existing DELETE undo route refuses task entries. Retrying the void returns the original correction.

Before sending a bonus/demerit request, an assistant must have the actual child, task, quantity and reason supplied or explicitly approved by the parent. It must not infer defaults from the legacy weekly scoring rules or submit a request simply because a chore was missed.

## Verification

`npm run test:task-points -w backend` runs HTTP authorization, input validation, retries, task deletion and void tests, plus the actual SQL migration against isolated PostgreSQL (PGlite). PostgreSQL checks cover existing balances, uniqueness, cross-house constraints, immutable intent, correction history and financial exclusion. All test identities and data are synthetic. No production database or wallet is used.
