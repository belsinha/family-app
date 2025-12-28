# Family App

A family points management application for tracking bonus and demerit points for children. Built with React frontend, Node.js backend, and SQLite database.

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

### Frontend
- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm run preview` - Preview production build

## Database

The SQLite database is automatically created on first run in `backend/data/family-app.db`. Seed data is automatically populated with:

- **Houses**: Campo Bom, Morro Grande 149, Morro Grande 177, Tubarao, Brooksville, Terrenos
- **Children**: Isabel, Nicholas, Laura
- **Parents**: Rommel, Celiane

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


