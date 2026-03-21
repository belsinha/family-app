import express from 'express';
import cors from 'cors';
import path from 'path';
import { config } from './config.js';
import { initDatabase } from './db/init-supabase.js';
import { logger } from './middleware/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import routes from './routes/index.js';
import { getOrFetchPrice } from './services/bitcoin.js';
import { getPublicApiBaseForClient } from './publicApiBase.js';
import { resolveFrontendIndex, formatFrontendSearchList } from './resolveFrontendDist.js';

const frontendResolved = resolveFrontendIndex();
const serveFrontend = frontendResolved != null;
const frontendDist = frontendResolved?.dist ?? '';
const frontendIndex = frontendResolved?.index ?? '';

const app = express();

// Middleware
app.use(cors({
  origin: true,
  credentials: true,
}));
app.use(express.json());
app.use(logger);

// Health check (before database init for quick health checks)
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// API discovery (previously served at `/` when the API ran alone)
app.get('/api/info', (req, res) => {
  res.json({
    message: 'Family App API',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      api: '/api',
      auth: '/api/auth',
      users: '/api/users',
      children: '/api/children',
      points: '/api/points',
      bitcoin: '/api/bitcoin',
    },
  });
});

// Routes
app.use('/api', routes);

// Tells the SPA where /api lives (must be before static + SPA fallback; not under /api/)
app.get('/api-config.js', (_req, res) => {
  const base = getPublicApiBaseForClient();
  res.type('application/javascript');
  res.setHeader('Cache-Control', 'no-store');
  res.send(`window.__FAMILY_APP_API_BASE__=${JSON.stringify(base)};`);
});

if (serveFrontend) {
  app.use(express.static(frontendDist));
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (req.path === '/health') return next();
    // Real API is /api/... or exactly /api — not /api-config.js
    if (/^\/api(\/|$)/.test(req.path)) return next();
    // Let missing hashed assets 404 as real 404, not index.html
    if (req.path.startsWith('/assets/')) return next();
    const ext = path.extname(req.path);
    if (ext && ext !== '.html') return next();
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(frontendIndex, (err) => next(err));
  });
} else {
  app.get('/', (req, res) => {
    res.json({
      message: 'Family App API',
      version: '1.0.0',
      note: 'Frontend dist not found next to backend; see /api/info',
      endpoints: {
        health: '/health',
        apiInfo: '/api/info',
        api: '/api',
      },
    });
  });
}

// Error handling
app.use(errorHandler);

// Initialize database and start server
initDatabase()
  .then(async () => {
    if (serveFrontend) {
      const apiHint = getPublicApiBaseForClient();
      console.log(`Serving SPA from ${frontendDist}`);
      console.log(
        apiHint
          ? `Client API base (from env): ${apiHint}`
          : 'Client API base: same origin /api (set RENDER_EXTERNAL_URL or PUBLIC_API_BASE_URL if HTML is on another host)'
      );
    } else {
      console.error('Frontend dist not found; GET /chores etc. will 404. Checked paths:\n' + formatFrontendSearchList());
      console.error(`process.cwd()=${process.cwd()}`);
    }

    // Fetch Bitcoin price on startup
    try {
      const priceData = await getOrFetchPrice();
      if (priceData) {
        console.log(`Bitcoin price fetched on startup: $${priceData.price_usd.toFixed(2)}`);
      } else {
        console.warn('Bitcoin price not available on startup');
      }
    } catch (error) {
      console.warn('Failed to fetch Bitcoin price on startup:', error);
    }

    // Set up background price fetcher (every 15 minutes)
    const fetchIntervalMs = parseInt(process.env.BITCOIN_PRICE_FETCH_INTERVAL_MS || '900000', 10);
    setInterval(async () => {
      try {
        const priceData = await getOrFetchPrice();
        if (priceData) {
          console.log(`Bitcoin price updated: $${priceData.price_usd.toFixed(2)} at ${priceData.fetched_at.toISOString()}`);
        } else {
          console.warn('Background Bitcoin price fetch returned null - no price available');
        }
      } catch (error) {
        console.error('Background Bitcoin price fetch failed:', error);
        if (error instanceof Error) {
          console.error('Error details:', error.message, error.stack);
        }
      }
    }, fetchIntervalMs);

    console.log(`Bitcoin price background fetcher started (interval: ${fetchIntervalMs / 1000 / 60} minutes)`);

    const server = app.listen(config.port, '0.0.0.0', () => {
      console.log(`Server running on port ${config.port}`);
      console.log(`Server accessible at http://0.0.0.0:${config.port}`);
    });

    // Handle server errors
    server.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`Port ${config.port} is already in use`);
      } else {
        console.error('Server error:', error);
      }
      process.exit(1);
    });
  })
  .catch((error) => {
    console.error('Failed to initialize database:', error);
    console.error('Error details:', error instanceof Error ? error.stack : String(error));
    process.exit(1);
  });
