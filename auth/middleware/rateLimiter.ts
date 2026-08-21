/**
 * auth/middleware/rateLimiter.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Tiered rate limiters for auth endpoints.
 * More aggressive on sensitive operations (login, password reset).
 */

import rateLimit from "express-rate-limit";
import type { Request, Response } from "express";

const rateLimitResponse = (_req: Request, res: Response) => {
  res.status(429).json({
    success: false,
    error: "Too Many Requests",
    message: "You've made too many requests. Please wait a moment and try again.",
    code: "RATE_LIMIT_EXCEEDED",
  });
};

const getClientIp = (req: Request) =>
  (req.headers["x-client-ip"] as string) ||
  (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
  req.ip ||
  req.socket.remoteAddress ||
  "unknown";

/**
 * Login / register rate limiter:
 * Max 5 attempts per 15 minutes per IP.
 * Prevents brute-force attacks.
 */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitResponse,
  keyGenerator: getClientIp,
  validate: false,
  skipSuccessfulRequests: true, // Only count failed attempts
});

/**
 * Registration limiter: 10 accounts per hour per IP.
 * Prevents mass account creation.
 */
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitResponse,
  keyGenerator: getClientIp,
  validate: false,
});

/**
 * Password reset / forgot password: 10 requests per hour per IP.
 * Prevents email flooding.
 */
export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitResponse,
  keyGenerator: getClientIp,
  validate: false,
});

/**
 * Token refresh: 30 requests per 5 minutes per IP.
 */
export const refreshLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitResponse,
  keyGenerator: getClientIp,
  validate: false,
});

/**
 * General auth limiter (for GET /auth/me, etc.): 100 per minute.
 */
export const generalAuthLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitResponse,
  keyGenerator: getClientIp,
  validate: false,
});
