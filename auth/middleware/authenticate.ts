/**
 * auth/middleware/authenticate.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Express middleware that verifies the JWT Access Token from the
 * Authorization header and attaches `req.user` to the request.
 *
 * Usage: app.use('/api', authenticate)
 */

import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../services/token.service.js";
import type { AccessTokenPayload, UserRole } from "../config/jwt.js";

// Extend Express User type
declare global {
  namespace Express {
    interface User {
      id: string;
      email: string;
      role: UserRole;
    }
  }
}

/**
 * Extracts and verifies the Bearer token from Authorization header.
 * On success: attaches `req.user = { id, email, role }`.
 * On failure: returns 401.
 */
export function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({
      success: false,
      error: "Unauthorized",
      message: "No authentication token provided.",
      code: "NO_TOKEN",
    });
    return;
  }

  const token = authHeader.slice(7); // Remove "Bearer "

  try {
    const payload: AccessTokenPayload = verifyAccessToken(token);
    req.user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
    };
    next();
  } catch (err: any) {
    const isExpired = err?.name === "TokenExpiredError";
    res.status(401).json({
      success: false,
      error: "Unauthorized",
      message: isExpired
        ? "Authentication token has expired. Please refresh your session."
        : "Invalid authentication token.",
      code: isExpired ? "TOKEN_EXPIRED" : "INVALID_TOKEN",
    });
  }
}

/**
 * Optional authentication — attaches user if token present, but doesn't
 * block unauthenticated requests. Useful for public endpoints with
 * user-specific behavior.
 */
export function authenticateOptional(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    try {
      const payload: AccessTokenPayload = verifyAccessToken(token);
      req.user = { id: payload.sub, email: payload.email, role: payload.role };
    } catch {
      // Ignore invalid token in optional mode
    }
  }
  next();
}
