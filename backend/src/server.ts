import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { initDatabase } from './db/init-supabase.js';
import { logger } from './middleware/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import routes from './routes/index.js';

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
      points: '/api/points'
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
  .then(() => {
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



