# Chores persistence in Supabase Postgres

Chores can use the existing Supabase project's private `chores` schema through Prisma. The HTTP routes and financial ledger behavior remain the same. SQLite remains supported for local development. Production Postgres startup reads import metadata and refuses an unimported store or a different configured house. Production startup no longer runs legacy schema migrations, default account seeding or orphan-conversion deletion. Chores reads in Postgres do not seed members or infer editor permissions from names.

No live migration or deployment is part of the code change. Do not apply the Render blueprint to create a duplicate service. The existing backend and frontend are separately managed services.

## Accepted recovery baseline

The owner accepted the VDI May 2 SQLite file as the recovery baseline. Its SHA-256 is `333a1d239f60a79ddc721b3ee1ff58f392144718d9c387b913051a7c07711665`. Preserve the original and a read-only private copy; never commit either. It contains 9 categories, 4 household members, 47 templates, 47 assignment links, 22 task instances (May 2 only), and zero monthly allowance decisions. The schema supports allowance decisions and the import preserves them when present. Later production history is not represented in this accepted baseline. Render support recovery is no longer required and no support message was sent.

## Access and backup prerequisites

The connected account could not inspect project `qusvfeposzfmhggrvots`; its actual schema, plan, usage and existing direct-database access remain unverified. An owner must first inspect the existing project and privately confirm the intended `public.houses.id`. No ID is inferred from a person's name or assumed to be 1.

Before production changes, export the existing PostgreSQL database (schema, rows, roles/grants, RLS policies, functions/triggers and migration history) into an owner-approved private destination and test restoration in isolation. Retain the accepted SQLite baseline. Record existing table counts and financial totals for comparison without posting personal rows. Verify the new `chores` schema does not already exist: the migration deliberately refuses collisions.

Prisma needs an existing private direct/session database connection, not an API publishable/anon key. Use the existing authorized credential through a private secret store; never put it in chat, a command argument, frontend variables, logs or Git. This change does not create a role/password or configure secrets. Direct IPv6 or Supavisor session mode on port 5432 is supported; transaction mode on 6543 is deliberately not used. The URL needs `sslmode=require` (or `verify-full`) and `schema=chores`, and must belong to the same Supabase project as SUPABASE_URL. Follow the project's CA/verified-TLS requirements when using verify-full.

The private schema enables RLS on every table, revokes PUBLIC/anon/authenticated access and has no browser policies. Do not expose it through the Data API. An existing trusted owner connection can access its own tables; a separate existing runtime role would need explicitly reviewed schema usage, table CRUD and sequence access, plus an appropriate RLS policy. No such grants/policies are automatically created. Review and approve the exact existing connection role before use; using a broad database-owner credential in the backend is a materially broader privilege than a narrow runtime role. Do not bypass RLS or create new credentials just to make the app start.

## Proposed production effects and execution order

Pause application writes for the cutover and retain rollback material. Obtain approval for each concrete production effect below once target access/schema are verified.

1. Apply only `supabase/migrations/20261010205952_chores_postgres_persistence.sql` using the reviewed migration mechanism. It transactionally creates a new private schema, six chores model tables, one singleton StoreMetadata table, identity sequences, indexes and relationships. StoreMetadata's house ID references existing `public.houses`. It changes no public ledger row and creates no role or credential. Do not blindly push all unapplied migrations: the earlier task-point migration needs its own schema preflight.
2. Run the offline import validation first (from repository root):

   ```sh
   node backend/scripts/import-chores-postgres.mjs --source /private/path/chores.db --expected-sha 333a1d239f60a79ddc721b3ee1ff58f392144718d9c387b913051a7c07711665
   ```

3. After explicit import approval, privately supply CHORES_DATABASE_URL in the process environment and run the same command with `--apply --project-ref qusvfeposzfmhggrvots --house-id <verified-id>`. The target project/port/TLS/schema are checked before connecting. No application startup/config is imported. One serializable transaction locks all chores tables, checks the house and empty target, inserts baseline rows preserving IDs and every scalar field, compares every imported scalar value with the source, advances sequences transactionally and records source checksum/house. An occupied store, checksum mismatch, source schema/integrity error, missing house or failed relationship aborts; there is no overwrite/delete/upsert. Logs contain only checksums/counts, not rows or connection secrets. If COMMIT outcome is uncertain due to network failure, inspect StoreMetadata and counts privately before retrying; automatic retry refuses a populated store.
4. Compare counts, field reconciliation and existing financial totals, and create a post-import private PostgreSQL backup with a tested restore.
5. Configure the existing Render backend's private CHORES_DATABASE_URL and verified CHORES_HOUSE_ID, then deploy the reviewed code only after existing JWT/service-role/origin and wallet startup prerequisites are satisfied. Do not enable hot-wallet signing to bypass the mnemonic guard. No paid Render disk is needed for this path. Keep task-point feature switches off until their separate schema/authorization verification is complete.
6. Verify authenticated household access, preserved member permissions, task history and allowance workflows; no payment or conversion is needed for verification. Recheck original financial totals. Reconnect/restart checks should prove state remains in PostgreSQL.

## Backup and rollback

The importer never edits the SQLite file. A rejected transaction leaves no partial imported rows and transactional sequence changes roll back. If migration succeeds but import fails, keep the empty schema for investigation; do not automatically drop it. No rollback script deletes data.

Before new writes, roll back deployment/config only to a compatible code/config combination with verified backup restoration, not an old build pointed at a PostgreSQL URL with a SQLite-only client. After any new chores writes, export current PostgreSQL state and prefer a compatible code rollback/roll-forward that continues to use PostgreSQL; the May 2 file cannot preserve newer writes. Database restoration or dropping the new schema is a separate approved operation. Once task-point ledger entries exist, retain financial source filtering in any code rollback.

## Cost

The existing Supabase project can hold this small dataset without a new Render disk or a new database project. Current advertised Supabase Free limits include 500 MB database storage; Free projects can pause after a week of inactivity and have no automatic backups. Existing total usage/plan must be inspected before promising zero incremental cost. Manual private exports are still required. Render Free compute can remain in use, subject to its ordinary sleep/resource limits. A paid tier is not intrinsically required by this design.

References: [Supabase Prisma/session connections](https://supabase.com/docs/guides/database/prisma), [Supabase pricing](https://supabase.com/pricing), [Render Free limitations](https://render.com/docs/free).
