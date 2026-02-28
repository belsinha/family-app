# Family App

A family application that includes **Casa Organizada** (Home Operations Manager) for recurring household tasks, points, and weekly scoring, plus family points management for children.

The home page is Casa Organizada: view today's tasks, weekly summary, task templates, and history. Only Celiane can edit task templates.

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
3. From `backend/`: run migrations and seed:
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
Create a `.env` file in the `backend/` directory (optional):
```
PORT=3001
NODE_ENV=development
DATABASE_PATH=./data/family-app.db
CHORES_DATABASE_URL=file:./data/chores.db
```

### Frontend
Create a `.env` file in the `frontend/` directory (optional):
```
VITE_API_URL=http://localhost:3001/api
```

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

### Installation Issues

If you encounter errors during `npm install`:

1. **Clean install**: Delete `node_modules` folders and `package-lock.json` files, then run `npm install` again
2. **Windows-specific**: The database library (sql.js) is pure JavaScript and doesn't require Visual Studio build tools, so installation should work on all platforms
3. **Font Awesome warning**: The warning about Font Awesome version is harmless - the app will work correctly


