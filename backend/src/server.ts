import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { initDatabase } from './db/init-supabase.js';
import { logger } from './middleware/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import routes from './routes/index.js';
import { getOrFetchPrice } from './services/bitcoin.js';

const app = express();

// Middleware
app.use(cors({
  origin: true,
  credentials: true,
}));
app.use(express.json());
app.use(logger);

// Root route
app.get('/', (req, res) => {
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
      bitcoin: '/api/bitcoin'
    }
  });
});

// Health check (before database init for quick health checks)
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Routes
app.use('/api', routes);

// Error handling
app.use(errorHandler);

// Initialize database and start server
initDatabase()
  .then(async () => {
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



