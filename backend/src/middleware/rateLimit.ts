import rateLimit, { type Options } from 'express-rate-limit';
import type { Request, Response } from 'express';
import { normalizeLoginName } from '../utils/loginName.js';

/**
 * Single-instance in-memory rate limiting (express-rate-limit's default store). Fine for this
 * app's current single-process deployment; would need a shared store (e.g. Redis) if it's ever
 * scaled to multiple instances behind a load balancer.
 */
type LimiterOptions = Partial<Options> & { windowMs: number; limit: number };

function jsonRateLimitHandler(message: string) {
  return (_req: Request, res: Response) => {
    res.status(429).json({ error: message });
  };
}

export function createRateLimiter(message: string, options: LimiterOptions) {
  return rateLimit({
    standardHeaders: true,
    legacyHeaders: false,
    handler: jsonRateLimitHandler(message),
    ...options,
  });
}

/**
 * Keys a request by its (normalized, lowercased) login name, falling back to per-IP keying when
 * the body has no usable name. Exported so tests can exercise it directly with a fresh, small
 * limiter instead of racing the real production limit.
 */
export function loginNameKeyGenerator(req: Request): string {
  const rawName = typeof req.body?.name === 'string' ? req.body.name : '';
  const name = normalizeLoginName(rawName).toLowerCase();
  return name ? `name:${name}` : `ip:${req.ip}`;
}

/** Login brute-force guard: caps attempts per source IP, regardless of which account is targeted. */
export const loginIpRateLimiter = createRateLimiter(
  'Too many login attempts from this address. Please try again later.',
  { windowMs: 15 * 60 * 1000, limit: 15 }
);

/**
 * Login brute-force guard: caps attempts per targeted login name, independent of source IP, so a
 * distributed (many-IP) credential-stuffing run against one account is still throttled. Falls
 * back to per-IP keying when the request body has no usable name, so an attacker can't dodge the
 * limit just by omitting/mangling the field.
 */
export const loginNameRateLimiter = createRateLimiter(
  'Too many login attempts for this account. Please try again later.',
  { windowMs: 15 * 60 * 1000, limit: 6, keyGenerator: loginNameKeyGenerator }
);

/**
 * Upload / import-parsing routes (spreadsheet + PDF parsing) are CPU- and memory-heavy per
 * request, so they're throttled harder than a plain write.
 */
export const uploadRateLimiter = createRateLimiter(
  'Too many file uploads from this address. Please try again later.',
  { windowMs: 15 * 60 * 1000, limit: 10 }
);

/**
 * General guard on sensitive mutations across the API (points, payouts, task/template edits,
 * household changes, etc.) so a single client can't hammer write endpoints even without tripping
 * a more specific limiter above. Read traffic (GET/HEAD/OPTIONS) is left unthrottled here.
 */
export const writeRateLimiter = createRateLimiter(
  'Too many requests. Please slow down and try again shortly.',
  {
    windowMs: 60 * 1000,
    limit: 60,
    skip: (req: Request) => req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS',
  }
);
