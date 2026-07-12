# Family App

A family application that includes **Casa Organizada** (Home Operations Manager) for recurring household tasks, points, and weekly scoring, plus family points management for children.

After sign-in, the home page is the family app (children list for parents, child dashboard for children). **Casa Organizada** is at `/chores` inside the same app shell as the family pages. Parents see a **Casa Organizada** item in the main nav, a today’s-summary card on the children list, and can open a child’s tasks via **Their tasks** (sets `?member=`). Children who match a chores household member by first name see a **Casa Organizada** card on the dashboard and a header link. Optional URL: `/chores?member=<id>&tab=today|week|templates|history`. Only Celiane can edit task templates.

## Prerequisites

- Node.js (v18 or higher)
- npm (comes with Node.js)

## Installation

1. Install dependencies for all workspaces:
```bash
npm install
```

This will install dependencies for the root workspace, frontend, backend, and shared packages.

## Running the Application

The application consists of two servers that need to run simultaneously:

### Option 1: Run Both Servers Separately

**Terminal 1 - Backend:**
```bash
npm run dev:backend
```
The backend server will start on port 3001.

**Terminal 2 - Frontend:**
```bash
npm run dev:frontend
```
The frontend development server will start on port 3000.

### Option 2: Run Both Servers Together

```bash
npm install  # Install concurrently if not already installed
npm run dev
```

This will start both servers simultaneously. Press `Ctrl+C` to stop both servers.

## Accessing the Application

- Frontend: http://localhost:3000
- Backend API: http://localhost:3001/api
- Health Check: http://localhost:3001/health

## Project Structure

```
family-app/
├── frontend/          # React + TypeScript + Tailwind CSS
├── backend/           # Node.js + Express + TypeScript
├── shared/            # Shared TypeScript types
└── package.json       # Root workspace configuration
```

## Available Scripts

### Root Level
- `npm install` - Install all dependencies
- `npm run dev:frontend` - Start frontend development server
- `npm run dev:backend` - Start backend development server
- `npm run dev` - Start both servers

### Backend
- `npm run dev` - Start backend with hot reload (from backend directory)
- `npm run build` - Build TypeScript to JavaScript
- `npm start` - Run production build
- `npm run db:chores:migrate` - Apply Prisma migrations for chores DB (from backend directory)
- `npm run db:chores:seed` - Seed household members and task templates (from backend directory)
- `npm run test` - Run unit tests for scoring and scheduling (from backend directory)

### Frontend
- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm run preview` - Preview production build

## Casa Organizada (Chores) – Setup

The chores app uses a separate SQLite database (Prisma) and must be set up once:

1. From the repo root: `npm install`
2. In `backend/`, set the chores database URL (optional; default is `file:./data/chores.db`):
   - Create `backend/.env` with: `CHORES_DATABASE_URL=file:./data/chores.db`
3. From `backend/`: run migrations and seed (scripts normalize `CHORES_DATABASE_URL` so Prisma uses the same file as the API—`backend/data/chores.db`):
   ```bash
   cd backend
   npm run db:chores:migrate
   npm run db:chores:seed
   ```
4. Start the app: from repo root, `npm run dev` (or run backend and frontend separately).

### Chores API

- `GET /api/household-members` – List household members (Celiane, Isabel, Nicholas, Laura)
- `GET /api/tasks/today?date=YYYY-MM-DD&userId=...` – Tasks for a date (optional filter by user)
- `POST /api/tasks/:instanceId/complete` – Body: `{ "doneWithoutReminder": boolean }`
- `POST /api/tasks/:instanceId/miss` – Mark task missed
- `GET /api/weekly-summary?weekStart=YYYY-MM-DD` – Weekly totals and classification per user
- `GET /api/templates` – List task templates
- `POST /api/templates` – Create template (requires `X-Editor-User-Id` header = Celiane’s member id)
- `PUT /api/templates/:id` – Update template (same header)
- `DELETE /api/templates/:id` – Delete template (same header)

### Scoring rules (weekly)

- **DONE**: +1 (or template’s `pointsBase`)
- **DONE without reminder**: +1 bonus in addition to base
- **MISSED**: -2
- **Complaint logged**: -1
- **Extra (voluntary) task**: +2

Weekly classification (per person):

- **Green**: total ≥ 40
- **Yellow**: 25–39
- **Red**: &lt; 25

Week boundaries use Monday–Sunday (ISO week). Reporting is by week start (Monday) date.

### Schedule rules

- **DAILY** – Every day
- **EVERY_OTHER_DAY** – Alternating days (fixed parity from epoch)
- **WEEKLY** – On a given weekday (0=Sunday … 6=Saturday)
- **MONTHLY** – By week of month (1–4) or by day of month (1–31)
- **SEMIANNUAL** – Configurable months (e.g. January and July)
- **CONDITIONAL_SCHEDULE** – On a given weekday with an “available after” time (e.g. Thursday after 18:00, Friday night 21:00 for trash)

Trash rules (time-aware):

- Thursday after 18:00: “Take out all trash (yard + recyclable + regular)” – Nicholas
- Friday night (21:00): “Take out regular trash for Tuesday pickup” – Nicholas
- Tuesday night: “Empty bedroom trash” – each person

Tasks with `availableAfter` are shown in the UI but cannot be completed until that time (local).

### Editing templates

Only the household member with **canEditChores** (Celiane) can create, update, or delete task templates. The API requires the header `X-Editor-User-Id` set to that member’s id for write operations.

### Tests

From `backend/`:

```bash
npm run test
```

Runs unit tests for scoring and for schedule generation (DAILY, EVERY_OTHER_DAY, WEEKLY, MONTHLY, SEMIANNUAL, CONDITIONAL_SCHEDULE).

## Database

The main app may use Supabase/Postgres. The chores app uses SQLite in `backend/data/chores.db` (Prisma). Chores seed data includes:

- **Household members**: Celiane (can edit chores), Isabel, Nicholas, Laura
- **Task templates**: Daily (Toby walks, kitchen, bathrooms, etc.), every-other-day (litter, mop, vacuum), weekly (bathroom deep clean, bedroom vacuum/mop, trash), monthly, semiannual, and conditional trash rules

Legacy/family points data (if used): houses, children, parents.

### Supabase: challenges API (`GET /api/challenges/...`)

If production logs show `Could not find the table 'public.challenges' in the schema cache`, the Postgres project was provisioned before that feature was added. In the **Supabase** dashboard, open **SQL Editor** and run the `challenges` and `challenge_progress` definitions (including their indexes) from `backend/src/db/schema-postgres-supabase.sql`—the block starting at `-- Challenges table` through `idx_challenge_progress_challenge_id`. All statements use `IF NOT EXISTS`, so they are safe to run once against an existing database.

## API Endpoints

### Users
- `GET /api/users` - Get all users
- `GET /api/users/:id` - Get user by ID

### Children
- `GET /api/children` - Get all children
- `GET /api/children/:id` - Get child by ID

### Points
- `POST /api/points` - Add points (bonus or demerit)
- `GET /api/points/child/:childId` - Get all points for a child
- `GET /api/points/child/:childId/balance` - Get point balance for a child

## Environment Variables

### Backend
Copy `backend/.env.example` to `backend/.env` and fill in your own values:
```
PORT=3001
NODE_ENV=development
DATABASE_PATH=./data/family-app.db
CHORES_DATABASE_URL=file:./data/chores.db
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=your_publishable_or_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```
`SUPABASE_URL` and `SUPABASE_ANON_KEY` (or `SUPABASE_PUBLISHABLE_KEY`) are **required** — the
backend exits on startup if they're missing, in every environment including local dev. There is
no hardcoded fallback project; see [Security](#security-rotate-the-supabase-key) and
`backend/SUPABASE_SETUP.md`.

**Render / PaaS:** The repo `render.yaml` attaches a **persistent disk** and sets `CHORES_DATABASE_URL` and `DATABASE_PATH` under that mount so **chore templates and the main SQLite DB survive deploys**. That requires a **paid** web instance (`plan: starter` or higher); Render does not offer persistent disks on the free tier. If you use `plan: free`, SQLite files under the app directory are **ephemeral** and will look “wiped” after each deploy. For local dev, keep `CHORES_DATABASE_URL=file:./data/chores.db` and `DATABASE_PATH=./data/family-app.db`. Do not use `file:/data/chores.db` — the app remaps that mistake to `backend/data/`, but fix wrong values in the dashboard when you see them.

**Render build command:** Use the **repository root** as the service root directory. The build must produce `frontend/dist` before the backend build runs `copy-spa-to-dist`. Either use the same **inline** command as `render.yaml` (`npm install && cd frontend && … && cd ../backend && npm run build`) or, after pulling a commit that includes it, `npm install && npm run build:render`. If the dashboard uses `npm run build:render` but GitHub `main` does not define that script yet, the build fails with “Missing script”. Do not use `npm install && cd backend && npm run build` only — that skips the frontend and fails at `copy-spa-to-dist`.

Chores **migrations** run automatically when the Prisma client module loads (`npx prisma migrate deploy` from the backend package root, after `CHORES_DATABASE_URL` is normalized), so they always target the same SQLite file the API uses—including on Render (`start:render` is `node dist/server.js` only). Set `CHORES_SKIP_MIGRATE_ON_START=1` to skip that step (e.g. some test runs). The backend **build** does not run chores migrations. Run `npm run db:chores:seed` from `backend/` when you want to merge in missing **canonical** seed templates; it does not delete custom templates unless `CHORES_SEED_RESET=1`.

**Render frontend URL:** The blueprint builds the Vite app under `frontend/`, then runs `npm run build` in `backend/`. The backend build copies `frontend/dist` into `backend/dist/static-frontend/` (same tree as `server.js`) and serves it from there, so paths like `/login` and `/chores` work without CDN rewrite rules. Open the **web** service URL from Render, not a separate Static Site, unless that site has a rewrite `/*` → `/index.html`. When `RENDER_EXTERNAL_URL` is set at build time, the blueprint exports `VITE_API_URL` so the client targets the correct API origin.

**Bitcoin wallet:** Cloud deployments are watch-only or disabled by default. Configure `BITCOIN_XPUB` for receive addresses and balances without a signing key. Server-side signing requires an explicit opt-in and a runtime-managed secret; follow [docs/bitcoin-wallet-operations.md](docs/bitcoin-wallet-operations.md) before enabling it.

### Chore import uploads and AI parsing

`POST /api/templates/import-parse` is limited to authenticated chore editors and accepts one PDF,
`.txt`, JPEG, PNG, GIF, or WebP file up to **10MB**. Uploads are held in memory for the request
only and are never written to disk or logged. The extension and declared MIME type must be
allowlisted and agree, and the content is checked before it reaches a parser. Work is bounded to
25 PDF pages, 200,000 extracted characters, and 300 preview tasks.

AI parsing is disabled by default. Structured `Task:`/`Category:` text parses locally. Freeform
text/PDF and image OCR can use OpenAI only when both `OPENAI_API_KEY` and `CHORE_IMPORT_AI=1` are
set. `CHORE_IMPORT_AI=1` is the explicit acknowledgment that uploaded content, which may contain
household members' first names, will be sent to OpenAI's API. Without both settings, images are
rejected and text/PDF imports use local parsers, so uploaded content does not leave the server.
Parser and upstream failures return bounded errors that do not include file bytes or provider
response bodies.

### Frontend
Create a `.env` file in the `frontend/` directory (optional):
```
VITE_API_URL=http://localhost:3001/api
```
Omit `VITE_API_URL` for production builds that are served from the same host as the API (the app then uses `{origin}/api`). Keep it for local Vite on port 3000 or for a split static-site + API setup.

## Security & operations

Backups, key rotation (Supabase, the optional Bitcoin wallet, `JWT_SECRET`), log review, session
revocation, data retention/deletion, and privacy handling for AI-parsed uploads are covered in
[`docs/security-runbook.md`](docs/security-runbook.md). For how to report a security issue, see
[`SECURITY.md`](SECURITY.md).

## Security: rotate the Supabase key

An earlier version of this repo hardcoded a shared development Supabase project URL and
publishable (anon) key directly in `backend/src/config.ts` as a fallback, so the backend would
silently connect to that shared project if `SUPABASE_URL`/`SUPABASE_ANON_KEY` weren't set. That
fallback has been removed — the backend now requires its own env vars everywhere, including local
dev (see `backend/.env.example`) — but the old key is still present in this repo's git history.

**Before launching this app to production (or sharing the repo further), rotate/regenerate that
key in the Supabase dashboard** (Settings > API), and confirm no code path still assumes a shared
default project.

## Security: authentication posture

- **`JWT_SECRET` is required in production.** The backend exits on startup if `NODE_ENV=production`
  and `JWT_SECRET` isn't set — see `backend/.env.example` for how to generate one. In dev it falls
  back to an insecure placeholder so `npm run dev` still works without extra setup.
- **Token lifetime is role-aware.** Parent/family (admin-equivalent) tokens expire in 12h in
  production (7d in dev) via `JWT_EXPIRES_IN`; child tokens stay at 7d (`JWT_CHILD_EXPIRES_IN`) in
  every environment on purpose — kids' accounts are low-privilege, so we optimize for not making
  them re-login instead of shortening their session.
- **Password policy is role-aware**, enforced in `/api/auth/change-password`: parent/family
  accounts need 10+ characters with 3 of {lowercase, uppercase, digit, symbol}, can't reuse a
  handful of common weak passwords, and can't contain the account's own login name. Child accounts
  keep the original 4-character-minimum policy so a kid can still use their own name — that's an
  intentional UX tradeoff for low-stakes accounts, not an oversight.
- **bcrypt cost is 12** by default (`BCRYPT_COST` env, 10-15), up from the previous 10.
- **Login names are normalized** (trimmed, internal whitespace collapsed, control characters
  stripped, length-capped) before lookup, but matching stays case-sensitive — we deliberately did
  *not* lowercase-fold names, since that would require also renaming existing stored users to stay
  consistent, and getting that wrong locks people out.
- **Logout today is client-side only**: it deletes the JWT from `localStorage` on that device.
  There is no server-side revocation list — a JWT stays valid until it expires, even after
  logout, a password change, or a role change elsewhere. The shortened production expiry above is
  the practical mitigation for a leaked/stolen parent token. If you need to kill a specific
  session immediately (lost device, suspected compromise), the only lever today is rotating
  `JWT_SECRET`, which invalidates **every** user's token, forcing a full re-login. A proper
  per-user revocation mechanism (e.g. a `token_version` column on `users`, embedded in the JWT and
  checked per request) is a reasonable follow-up but is a real architectural change — it adds a DB
  round-trip to every authenticated request, which `authenticate` middleware doesn't do today —
  and Supabase schema changes in this repo are applied manually (see `SUPABASE_SETUP.md`), so it
  wasn't added speculatively here.
- **Seeded passwords are never a shared literal in production.** `backend/src/db/seed-supabase.ts`
  generates a strong random password per parent (or takes `SEED_ROMMEL_PASSWORD` /
  `SEED_CELIANE_PASSWORD` from env) and prints it once to the server log on first seed, instead of
  the old shared literal `"password"`. In production, child accounts (`Isabel`, `Nicholas`,
  `Laura`) get the same treatment — a strong random password (or `SEED_<NAME>_PASSWORD` override)
  printed once — instead of the outside-production default of "their own name lowercase". This
  only affects a **fresh, empty** database — if your production Supabase project was already
  seeded, existing accounts keep whatever password they were set up with.
  **Change every seeded password via "Change Password" right after first login.**
- **Production boot gate**: on every production startup, `backend/src/db/productionCredentialCheck.ts`
  queries all accounts and refuses to start the server (`process.exit(1)`) if any account's
  password still matches a known demo/default value (a common weak password, or a child's own
  name), or if there is no parent/admin account at all. This is defense-in-depth for the case
  above — a prod database seeded before this check existed, or one where defaults were never
  rotated. To remediate an already-live deployment that trips the gate (you need the app running
  to call `/api/auth/change-password`), set `ALLOW_DEFAULT_CREDENTIALS=true` to downgrade the gate
  to a warning for one boot, log in and fix the affected passwords, then remove the override.
- **`seed.ts` (legacy sql.js/SQLite seeder) is dev-only.** It isn't wired into the app's normal
  boot path (`server.ts` uses the Supabase seeder), but it now hard-throws if
  `NODE_ENV=production` so it can't accidentally seed a production-adjacent environment with its
  shared default parent password.

## Technology Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, React Router, Font Awesome
- **Backend**: Node.js, Express, TypeScript, SQLite (sql.js)
- **Database**: SQLite
- **Shared**: TypeScript types

## Development Notes

- The application uses a monorepo structure with npm workspaces
- Shared types are defined in the `shared/` package
- The backend uses sql.js (pure JavaScript SQLite) for database operations - no native compilation required
- Frontend uses Vite for fast development and building
- All styling is done with Tailwind CSS utility classes
- No external state management libraries - uses React hooks only

## Troubleshooting

### Render: `Frontend dist not found` in server logs

The service is starting without a built SPA. Confirm the deploy **build command** matches `render.yaml` (frontend `npm run build`, then `backend` `npm run build`). Backend build logs should include `copy-spa-to-dist: copied SPA to .../backend/dist/static-frontend`. If the frontend build fails or is skipped, the copy step exits with an error and deep links return 404. If the Render service **root directory** is set to `backend` only, the blueprint will not find `frontend/`—clear root directory or set a build that builds the whole repo.

### Installation Issues

If you encounter errors during `npm install`:

1. **Clean install**: Delete `node_modules` folders and `package-lock.json` files, then run `npm install` again
2. **Windows-specific**: The database library (sql.js) is pure JavaScript and doesn't require Visual Studio build tools, so installation should work on all platforms
3. **Font Awesome warning**: The warning about Font Awesome version is harmless - the app will work correctly


