# Supabase Setup Instructions

## Database Configuration

The application is now configured to use Supabase (PostgreSQL) instead of SQLite.

## Initial Setup

1. **Create Tables**: Run the PostgreSQL schema in your Supabase SQL editor:
   - Go to your Supabase dashboard
   - Navigate to SQL Editor
   - Copy and paste the contents of `backend/src/db/schema-postgres-supabase.sql`
   - Execute the SQL
   - **Note**: "Success. No rows returned" is normal for CREATE TABLE statements - this means the tables were created successfully!

2. **Environment Variables** (Required):
   Copy `backend/.env.example` to `backend/.env` and fill in your **own** Supabase project's
   values (Settings > API in your Supabase dashboard):
   ```
   SUPABASE_URL=https://your-project-ref.supabase.co
   SUPABASE_ANON_KEY=your_publishable_or_anon_key_here
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
   ```
   There is no built-in fallback — the backend refuses to start (even in local dev) if
   `SUPABASE_URL`/`SUPABASE_ANON_KEY` aren't set, so it can never silently connect to
   someone else's project.

   **Note**: For full server-side database operations, you should use the **Service Role Key** instead of the publishable/anon key. The service role key can be found in your Supabase dashboard under Settings > API.

   **Security note**: An earlier version of this repo hardcoded a shared dev Supabase project
   URL and publishable key directly in `backend/src/config.ts`. That fallback has been removed,
   but the key is still present in git history. Treat it as compromised: **rotate/regenerate that
   key in the Supabase dashboard (Settings > API) before launching this app to production**, and
   make sure only environment variables (never source code) carry real credentials going forward.

3. **Start the Server**: The application will automatically:
   - Connect to Supabase
   - Check if tables exist
   - Seed initial data if the database is empty

## First-run credentials

Seeding never writes the literal password `"password"` — it never has for parent accounts, and
as of this change it doesn't for child accounts in production either.

- **Local/dev** (`NODE_ENV` not `production`): logging into a freshly seeded database uses
  - Parents (`Rommel`, `Celiane`): a strong random password, printed **once** to the server log
    the moment seeding runs. Copy it down immediately — it is not stored or shown again.
  - Children (`Isabel`, `Nicholas`, `Laura`): their own name in lowercase (e.g. `isabel`). This is
    an intentional low-friction default for local/home use, not a production credential.
- **Production** (`NODE_ENV=production`): both parents *and* children get a strong random
  password (or an explicit override — see below), printed once to the server log on first seed.
  There is no name-based or literal `"password"` default in production at all.

  To pin specific first-boot passwords instead of the random ones (e.g. for a scripted deploy),
  set before the first boot against an empty database:
  ```
  SEED_ROMMEL_PASSWORD=...
  SEED_CELIANE_PASSWORD=...
  SEED_ISABEL_PASSWORD=...
  SEED_NICHOLAS_PASSWORD=...
  SEED_LAURA_PASSWORD=...
  ```
  These only take effect while seeding an empty database — they do nothing once accounts exist.

  **Change every seeded password via "Change Password" right after first login.** In production,
  the backend also refuses to start at all if it detects any account still on a known
  demo/default password or if there's no parent account at all — see
  `backend/src/db/productionCredentialCheck.ts`. If a production database was seeded before this
  check existed and you need one boot to remediate it, set `ALLOW_DEFAULT_CREDENTIALS=true`
  temporarily, log in, change the affected passwords, then remove the override.

## Troubleshooting

- If you see "Database tables not found", make sure you've run the schema SQL in Supabase
- If you get permission errors, ensure you're using the Service Role Key for server-side operations
- Check that your Supabase URL and API keys are correct in the `.env` file

