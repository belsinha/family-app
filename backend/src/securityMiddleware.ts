import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createCorsOriginChecker } from './corsOrigins.js';

export interface SecurityMiddlewareConfig {
  allowedOrigins: string[];
  allowLocalhost: boolean;
  jsonLimit?: string;
}

/**
 * Helmet + CORS allowlist + JSON body size cap, shared by server.ts and its smoke tests.
 * CSP is left off: the SPA and API can be deployed on different origins (see publicApiBase.ts),
 * which a default same-origin CSP would break.
 */
export function applySecurityMiddleware(app: Express, cfg: SecurityMiddlewareConfig): void {
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(
    cors({
      origin: createCorsOriginChecker(cfg.allowedOrigins, cfg.allowLocalhost),
      credentials: true,
    })
  );
  app.use(express.json({ limit: cfg.jsonLimit ?? '1mb' }));
}
