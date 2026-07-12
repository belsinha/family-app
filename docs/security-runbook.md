# Security & Operations Runbook

Operational security procedures for running this app in the cloud (Render + Supabase +
OpenAI). This is a living checklist, not a policy document — mechanics for third-party
dashboards drift over time; where noted, confirm current behavior against the provider's own
docs before relying on a specific number (retention days, plan tiers, menu paths).

**Last reviewed:** 2026-07-12. **Owner:** Rommel / Celiane (the two parent accounts — see
[Access](#access--who-can-do-this)).

## Access — who can do this

Everything below assumes access to: the Render dashboard (owns the backend service + disk),
the Supabase dashboard (owns the Postgres project), the GitHub repo, and — if the Bitcoin
feature is enabled — whatever holds the wallet mnemonic. Keep that access limited to
Rommel and Celiane. If a third party ever needs temporary access (a helper debugging a deploy,
etc.), remove it when they're done and treat as a rotation trigger for anything they could have
seen (see [Incident response](#incident-response-quick-checklist)).

## Data map (read this before the backup sections)

Two separate stores hold real data, and they are **not** equally important:

- **Supabase (Postgres)** is the system of record for almost everything: `users`, `children`,
  `points`, `work_logs`, `projects`, `challenges`/`challenge_progress`,
  `bitcoin_price_cache`/`bitcoin_conversions`, `child_onchain_wallets`, `child_credit_payouts`.
  This is where family/child data actually lives.
- **The Render persistent disk** (`family-app-data`, mounted at
  `/opt/render/project/src/persist`) backs `chores.db`, a Prisma/SQLite database holding
  chore **task templates and completion history**. Nothing else reads or writes it at
  runtime — an older SQLite path (`DATABASE_PATH` / `sql.js`, `backend/src/db/connection.ts`
  + `init.ts`) still exists in the codebase but `server.ts` calls `init-supabase.ts`, not
  `init.ts`, so that file is not in the live path. Don't rely on `DATABASE_PATH` for anything;
  it's legacy.

So: **Supabase backups protect your family's actual data. The disk backup below mainly protects
chore templates/history**, which is annoying but not irreplaceable (templates can be reseeded).
Prioritize accordingly if you only have time for one.

## Render persistent disk backup/restore plan

Covers `chores.db` only (see [data map](#data-map-read-this-before-the-backup-sections)).

**What Render gives you for free:** disks get automatic encrypted daily snapshots, restorable
from the service's **Disks** page in the dashboard. Render's own docs warn against relying on a
whole-disk snapshot restore for database recovery — a snapshot taken mid-write can capture a
half-written file, and for a single SQLite file that means a corrupted `chores.db`. Treat disk
snapshots as a coarse safety net, not the primary plan. (Verify current snapshot retention and
the exact restore flow in Render's dashboard/docs — this changes over time:
[render.com/docs/disks](https://render.com/docs/disks).)

**Primary plan — application-level backup:**

1. Open the Render dashboard → `family-app-backend` service → **Shell** tab (needs a paid
   plan, which this service already runs on for the disk).
2. Take a consistent snapshot of the live file:
   ```bash
   sqlite3 /opt/render/project/src/persist/chores.db \
     ".backup '/opt/render/project/src/persist/chores-backup-$(date +%Y%m%d).db'"
   ```
   `.backup` is safe against concurrent writes, unlike a raw file copy.
3. Get the backup file off the disk (it still lives on the same disk, so a disk failure takes
   it too). Use Render's SSH/SCP support to pull it to your machine, or push it somewhere
   durable (e.g., upload to a private Supabase Storage bucket or S3). Do this periodically —
   before risky migrations at minimum, monthly otherwise.

**Restore:**

- **From a Render disk snapshot:** Disks page → select the disk → Snapshots → Restore. This
  replaces the *entire* disk (all of `chores.db`'s current state) with the snapshot's point in
  time and will cause downtime. Take a fresh `.backup` first if the current state is at all
  recoverable, in case the snapshot turns out stale.
- **From your own `.backup` file:** stop the service (or scale to zero), replace
  `chores.db` with the backup copy via Shell/SCP, restart, then run
  `npm run db:chores:migrate` from `backend/` in case the backup predates a schema migration.

## Supabase backup and key rotation procedure

This is the important one — see [data map](#data-map-read-this-before-the-backup-sections).

**Backup:**

1. Check your plan tier (Project Settings → Billing/Add-ons). Supabase auto-backs-up Pro/Team/
   Enterprise projects daily, with retention that scales by tier, and offers Point-in-Time
   Recovery as a paid add-on on Pro+ (requires at least a Small compute add-on). **Free-tier
   projects get no automatic backups at all.** Confirm current tiers/retention at
   [supabase.com/docs/guides/platform/backups](https://supabase.com/docs/guides/platform/backups)
   — this is exactly the kind of detail that changes without notice.
2. Regardless of tier, take your own logical backup periodically:
   ```bash
   pg_dump "$SUPABASE_DB_URL" -f backup-$(date +%Y%m%d).sql
   ```
   Get `SUPABASE_DB_URL` (the direct Postgres connection string, not the API URL) from
   Settings → Database → Connection string. **Never commit this string or the dump file** —
   store the dump encrypted and off-repo; the connection string embeds a password.
3. If you're on Free tier, this self-serve dump is your *only* safety net — schedule it (a
   personal cron/Task Scheduler job, or a private script you run manually on a regular
   cadence).

**Restore:**

- Dashboard-driven (Pro+ with backups/PITR): Database → Backups → pick a point → Restore.
  This overwrites current data — before doing this, take one more fresh export of anything
  written since the point you're restoring to, if you can.
- From your own dump: `psql "$SUPABASE_DB_URL" -f backup.sql`, ideally against a **new** Supabase
  project first to verify contents before pointing production at it.

**Key rotation** (do this now if you haven't — see README "Security: rotate the Supabase key";
an old dev key is still sitting in this repo's git history and must be treated as compromised):

1. Supabase Dashboard → Settings → API → regenerate the anon/publishable key and/or the
   service role key. Regenerating invalidates the old key immediately — anything still using it
   (a forgotten `.env`, an old deploy) breaks, which is the point.
2. Update `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` in the **Render Dashboard** →
   `family-app-backend` → Environment. Never put real values in `render.yaml` — it's
   `sync: false` there deliberately.
3. Save — Render redeploys automatically on env var change (or trigger a manual deploy).
4. Grep your own machines/`.env` files/anywhere else the old key might be cached, and delete it.
5. Only rotate `SUPABASE_URL` itself if you're migrating to an entirely new project — that's a
   migration, not a routine rotation.

## Bitcoin hot wallet: key handling & "rotation"

This app can hold and move **real money** if `BITCOIN_NETWORK=mainnet` and the wallet is funded
— `backend/src/services/bitcoinWallet.ts` derives addresses and signs/broadcasts real
transactions from `BITCOIN_MNEMONIC` or `BITCOIN_XPRV`. Confirm which network is actually
configured before assuming risk level: Render Dashboard → Environment → `BITCOIN_NETWORK`
(defaults to `testnet`, where coins are worthless, if unset).

These two env vars are **not currently documented** in `backend/.env.example` or `render.yaml`
(fixed in this change — see below) — if they're set anywhere today, find out where and treat
that as the sole source of truth for the family's actual coin custody.

**Why this key is different from every other secret here:** rotating an API key just means "the
old value stops working." Rotating a wallet key without moving funds first **orphans** whatever
BTC sits at addresses derived from the old key — the house hot wallet address
(`getHotWalletAddress()`, path `m/84'/coin'/0'/1/0`) and every child's `receive_address`
(`child_onchain_wallets` table, one per child). There is no "regenerate" button; there is only
"sweep, then replace."

**Handling (ongoing):**
- Generate the mnemonic offline (hardware wallet or an offline BIP-39 tool) — never through a
  web form, never pasted into any AI tool or chat.
- Store it in a password manager or an offline paper/metal backup. It goes into the **Render
  Environment tab only** (`sync: false`), never into git, never into a log line — confirmed no
  code path logs it today; keep it that way (don't add a debug `console.log(config.bitcoin)`).
- Access to whoever holds this value should be limited to Rommel/Celiane, same as Supabase.

**Rotation / suspected compromise procedure:**
1. With the *old* key still configured (so it can still sign), check balances at the hot wallet
   address and every child's receive address.
2. Sweep everything to addresses derived from a **new**, freshly-generated mnemonic — via the
   app's existing `/api/onchain/...` payout path or a one-off script using
   `buildAndSignTx`/`deriveChildAddress`.
3. Wait for on-chain confirmations before treating the funds as moved.
4. Set the new `BITCOIN_MNEMONIC` in Render, remove the old value, redeploy.
5. If you suspect the old key leaked (not just routine rotation), do step 2 as fast as possible
   — a leaked mnemonic is a live bank password with no fraud protection and no way to freeze it
   except moving the money first.

If `BITCOIN_NETWORK=testnet`, none of the urgency above applies — treat it as a dry run.

## Log/alert review

**What exists today:** every request logs one line (`METHOD path status durationMs`) via
`console.log` (`backend/src/middleware/logger.ts`), plus scattered `console.log/warn/error`
calls (startup, Bitcoin price fetches, the global error handler). All of it goes to Render's
built-in log stream — **there is no external log aggregation, log drain, or alerting
configured.** Confirmed: no code path logs `JWT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`,
`BITCOIN_MNEMONIC`/`BITCOIN_XPRV`, or raw passwords — keep it that way; never add a blanket
`console.log(req.body)`.

**Manual review cadence (since nothing is automated):**
- After every deploy and at least weekly: Render Dashboard → `family-app-backend` → Logs. Filter
  for 5xx status codes and stack traces from the error handler; check for repeated Supabase
  connection failures at startup or CoinGecko/Esplora fetch failures (both `console.error` in
  `services/bitcoin.ts`/`chainIndex.ts`).
- Confirm the current log retention window for your Render plan in the dashboard before
  assuming logs from more than a few days back still exist.

**Alerting gap:** none exists beyond whatever Render's own deploy-failure/health-check
notifications provide (Dashboard → account or service → Notifications — worth turning on).
Anything more (alert on a burst of 5xx, alert on a failed Bitcoin broadcast) needs a log drain to
a third party or adding a logging library with alert hooks; that's real work, not a checklist
item, and is intentionally out of scope here — treat it as a backlog item, not a false sense of
"we'd know."

## Session/key revocation steps

Matches the honest posture already documented in the README (`Security: authentication
posture`) — nothing below is aspirational.

- **Logout is client-side only.** There's no server-side token blocklist. A JWT is valid until
  it expires (12h for parents in prod, 7d for children, in every environment) regardless of
  logout, password change, or role change.
- **Revoking one specific user's session is not possible today.** Changing that user's password
  does *not* invalidate tokens already issued to them (no `token_version` check exists). The
  only lever for "kick this one person out right now" would be adding that check — not built.
- **The only real revocation lever is global: rotate `JWT_SECRET`** in the Render dashboard and
  redeploy. This invalidates *every* user's token — everyone, including kids mid-session, has to
  log in again. Use it for a suspected `JWT_SECRET` leak or a lost/stolen parent device with no
  other option, and give the family a heads-up first if you can.
- **Locked-out child / forgotten password:** there's no admin-triggered reset endpoint — only
  self-service `/api/auth/change-password`, which requires the current password. A parent must
  reset it directly in Supabase (Table Editor or SQL Editor on `users.password_hash`) using a
  freshly bcrypt-hashed value; there's no UI for this.
- **API keys** (`OPENAI_API_KEY`, Supabase keys): revoke/regenerate at the provider
  (platform.openai.com → API keys; Supabase → Settings → API), update the Render env var,
  redeploy.
- **Bitcoin wallet key:** see the dedicated procedure above — sweep funds before rotating, not
  after.
- **GitHub access:** if a collaborator's access needs revoking or a personal access token leaked,
  do it at github.com → Settings → Developer settings (token) and repo → Settings →
  Collaborators (access).

## Data retention, deletion & export (family/child data)

**What's actually collected today** (checked against `backend/src/db/schema-postgres-supabase.sql`
— no email, phone, or date-of-birth fields exist in this schema): login names, bcrypt password
hashes, roles, point history, chore completion history, work-log/project text, challenge
progress, Bitcoin conversion & payout records (amounts, timestamps, addresses), and each child's
on-chain wallet address if the Bitcoin feature is used.

**Where it lives:** Supabase Postgres (system of record for nearly all of the above), the Render
disk (`chores.db` — templates/history), OpenAI (transiently, for uploads — see next section),
and, if `BITCOIN_NETWORK=mainnet` was ever used, the public Bitcoin blockchain.

**There is no self-service export or delete feature in the app.** Handling either is a manual,
parent-only admin task:

- **Export:** Supabase SQL Editor — `SELECT * FROM <table> WHERE ...` exported as CSV, or
  `pg_dump --table=<name> ...` for a specific person across `users`, `children`, `points`,
  `work_logs`, `challenge_progress`, `bitcoin_conversions`, `child_onchain_wallets`,
  `child_credit_payouts`. For chore history, `sqlite3 chores.db` with `.mode csv` / `.output` on
  the relevant table.
- **Deletion:** checked the actual foreign keys in `schema-postgres-supabase.sql` — every
  child-scoped table (`points`, `work_logs`, `bitcoin_conversions`, `child_onchain_wallets`,
  `child_credit_payouts`, `challenge_progress`) has `child_id REFERENCES children(id) ON DELETE
  CASCADE`, and `children.user_id REFERENCES users(id) ON DELETE CASCADE`. So deleting a child's
  row in `users` cascades automatically through all of the above — one delete, not a manual
  ordering exercise. (`parent_id`/`created_by` columns elsewhere are `ON DELETE SET NULL`, so
  deleting a *parent's* `users` row does not cascade-delete any child data — it only nulls those
  references, which is what you want.) There's no undo without a backup, so take one first (see
  Supabase backup section) before deleting anything.
- **Hard limit worth stating up front if anyone asks:** on-chain Bitcoin transactions are
  permanent public ledger entries. Deleting a child's rows removes them from this app's
  database; it cannot erase the underlying blockchain record if real (mainnet) transactions ever
  happened.

**Retention policy (recommended — nothing is enforced automatically):** this is a private family
tool, not a regulated service, so there's no legal deletion SLA to meet — but child data is
involved, so keep dashboard access restricted to the two parent accounts (see
[Access](#access--who-can-do-this)), and if a child leaves the household or asks, export then
delete their rows within a timeframe the family is comfortable with (e.g., 30 days). Nothing
automates this; it's this runbook.

## Privacy notes: uploads & AI parsing

The chore-template import feature (`backend/src/services/choreImportParse.ts`, gated to
Celiane via `X-Editor-User-Id`) accepts PDF/TXT/image uploads up to 15MB.

- **Clean structured PDFs/text** (`Task:`/`Category:`/`Person:`/… key-value blocks, ≥2 matches
  detected by `looksStructuredChorePdf`) are parsed **entirely locally** — nothing leaves the
  server.
- **Everything else** (freeform text/PDF text, and *all* images) is sent to OpenAI's Chat
  Completions API (`gpt-4o-mini`) when `OPENAI_API_KEY` is set. This means uploaded content —
  which in practice has included household members' first names in `Person:` lines — leaves
  your infrastructure and goes to OpenAI as an API input.
- **If `OPENAI_API_KEY` is unset:** image import fails outright with an explicit error; text/PDF
  falls back to a local naive line-parser. No external call happens either way in that case.
- **Uploaded files are never persisted as-is:** multer holds them in memory
  (`multer.memoryStorage()`) for the duration of the request only; nothing is written to disk or
  logged. Only the resulting structured chore fields (name, schedule, category — not the raw
  file) get saved into `chores.db` on import.
- Data sent to OpenAI is subject to OpenAI's API terms (as of writing, API inputs aren't used
  for model training by default) — confirm the current policy at platform.openai.com before
  relying on that, since terms can change.
- **Practical guidance:** only upload documents that describe chores. Don't put anything beyond
  first names in these files, and don't repurpose this upload path for other family documents —
  there's no local-only guarantee once an image needs OCR.

## Incident response quick checklist

1. Identify exactly what's exposed (which credential, which data, since when).
2. **If it's the Bitcoin wallet key:** sweep funds to a new wallet *first* (see above) — do this
   before anything else, including rotating other secrets.
3. Rotate the specific credential at its source (Supabase, OpenAI, `JWT_SECRET`), not just in
   Render — regenerating at the provider is what actually invalidates the old value.
4. Update the Render env var, redeploy, and confirm the old value is gone from every `.env` file,
   CI secret, or teammate's machine that might still have it.
5. If `JWT_SECRET` was rotated, expect everyone logged out — tell the family before they ask.
6. If a secret was ever committed to git (like the old Supabase dev key still in this repo's
   history), rotating elsewhere is the *only* fix — a leaked value in git history is permanently
   compromised even if you later remove it from the working tree.
7. Check Render logs around the incident window for anything unusual (repeated auth failures,
   CORS rejections from unfamiliar origins).
8. Note what happened and what you changed somewhere durable (even just a dated note in this
   file) so future-you isn't re-deriving this from scratch.

## Periodic review checklist

Run this every few months, or after anything that touches auth/secrets/deploy config:

- [ ] Supabase plan/backup coverage still matches what's assumed above; take a manual `pg_dump`
      if on Free tier and it's been a while.
- [ ] Render disk: take a fresh `chores.db` `.backup` and move it off the disk.
- [ ] Confirm `BITCOIN_NETWORK` in the Render dashboard matches what you think is live; if
      mainnet and funded, confirm you know where the mnemonic is stored.
- [ ] Skim recent Render logs for repeated errors that never got investigated.
- [ ] Confirm access to Render/Supabase/GitHub/wallet-key storage is still limited to the two
      parent accounts; remove anyone who no longer needs it.
- [ ] Re-read this file for anything that's gone stale (menu paths, retention numbers, plan
      tiers) and update the "Last reviewed" date at the top.
