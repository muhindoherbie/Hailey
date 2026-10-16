import type { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import type { AppEnv } from './context.ts';
import { HttpError } from './context.ts';
import { resolveSession, SESSION_COOKIE } from './auth.ts';

/** Security headers for every response. The CSP allows only same-origin scripts. */
export const securityHeaders: MiddlewareHandler<AppEnv> = async (c, next) => {
  await next();
  const h = c.res.headers;
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  h.set('X-Frame-Options', 'DENY');
  h.set('Permissions-Policy', 'camera=(), geolocation=(), microphone=(self)');
  h.set('Cross-Origin-Opener-Policy', 'same-origin');
  if (!h.has('Content-Security-Policy')) {
    h.set(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "font-src 'self' data:",
        "img-src 'self' data: blob:",
        "connect-src 'self'",
        "worker-src 'self'",
        "manifest-src 'self'",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "object-src 'none'",
      ].join('; '),
    );
  }
  if (c.var.services?.config.isProd) h.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
};

/**
 * CSRF protection for state-changing API calls: require a custom header (browsers
 * won't send it cross-origin without CORS preflight, which we never grant) and,
 * when present, an Origin that matches this server.
 */
export const csrfGuard: MiddlewareHandler<AppEnv> = async (c, next) => {
  const m = c.req.method;
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return next();
  if (c.req.header('x-hailey') !== '1') throw new HttpError(403, 'Missing request header', 'csrf');
  const origin = c.req.header('origin');
  if (origin) {
    const allowed = new Set([new URL(c.var.services.config.PUBLIC_URL).origin, new URL(c.req.url).origin]);
    if (!allowed.has(origin)) throw new HttpError(403, 'Cross-origin request blocked', 'csrf');
  }
  return next();
};

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const { db, now } = c.var.services;
  const session = resolveSession(db, getCookie(c, SESSION_COOKIE), now());
  if (!session) throw new HttpError(401, 'Please sign in', 'unauthenticated');
  c.set('user', session.user);
  c.set('sessionId', session.sessionId);
  return next();
};

/** Fixed-window in-memory rate limiter. Fine for a single server process. */
export function rateLimit(opts: { windowMs: number; max: number; key: (c: any) => string; name: string }): MiddlewareHandler<AppEnv> {
  const hits = new Map<string, { count: number; reset: number }>();
  return async (c, next) => {
    const now = Date.now();
    const k = `${opts.name}:${opts.key(c)}`;
    let entry = hits.get(k);
    if (!entry || entry.reset <= now) {
      entry = { count: 0, reset: now + opts.windowMs };
      hits.set(k, entry);
    }
    entry.count++;
    if (hits.size > 10_000) for (const [key, e] of hits) if (e.reset <= now) hits.delete(key);
    if (entry.count > opts.max) {
      c.header('Retry-After', String(Math.ceil((entry.reset - now) / 1000)));
      throw new HttpError(429, 'Too many requests — please wait a moment and try again', 'rate_limited');
    }
    return next();
  };
}

export function clientIp(c: any): string {
  if (c.var.services?.config.trustProxy) {
    const fwd = c.req.header('x-forwarded-for');
    if (fwd) return fwd.split(',')[0].trim();
  }
  return c.env?.incoming?.socket?.remoteAddress ?? 'local';
}
