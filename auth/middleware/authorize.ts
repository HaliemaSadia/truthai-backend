/**
 * auth/middleware/authorize.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Role-Based Access Control (RBAC) middleware.
 * Must be used AFTER `authenticate` middleware.
 *
 * Usage:
 *   app.get('/api/admin/users', authenticate, authorize('admin'), handler)
 *   app.get('/api/data',        authenticate, authorize('user', 'admin'), handler)
 */

import type { Request, Response, NextFunction } from "express";
import type { UserRole } from "../config/jwt.js";

/**
 * Returns middleware that allows only users with one of the specified roles.
 * @param roles - One or more allowed roles
 */
export function authorize(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: "Unauthorized",
        message: "Authentication required.",
        code: "NOT_AUTHENTICATED",
      });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: "Forbidden",
        message: `Access denied. Required role: ${roles.join(" or ")}.`,
        code: "INSUFFICIENT_ROLE",
      });
      return;
    }

    next();
  };
}
