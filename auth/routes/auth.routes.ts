/**
 * auth/routes/auth.routes.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Route definitions for all authentication endpoints.
 * Applies per-route rate limiters, validation chains, and controllers.
 */

import { Router } from "express";
import passport from "passport";
import * as ctrl from "../controllers/auth.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorize } from "../middleware/authorize.js";
import {
  loginLimiter,
  registerLimiter,
  passwordResetLimiter,
  refreshLimiter,
  generalAuthLimiter,
} from "../middleware/rateLimiter.js";
import {
  validateRegister,
  validateLogin,
  validateForgotPassword,
  validateResetPassword,
  handleValidationErrors,
} from "../middleware/validate.js";

const router = Router();

// ─── Public Endpoints ─────────────────────────────────────────────────────────

/**
 * POST /auth/register
 * Create a new user account. Sends verification email.
 */
router.post(
  "/register",
  registerLimiter,
  validateRegister,
  handleValidationErrors,
  ctrl.register,
);

/**
 * GET /auth/verify-email?token=...
 * Verify email address via token from email link.
 */
router.get("/verify-email", generalAuthLimiter, ctrl.verifyEmail);

/**
 * POST /auth/login
 * Authenticate with email + password. Returns access token + sets refresh cookie.
 */
router.post(
  "/login",
  loginLimiter,
  validateLogin,
  handleValidationErrors,
  ctrl.login,
);

/**
 * POST /auth/logout
 * Revoke refresh token. Protected: requires valid access token.
 */
router.post("/logout", authenticate, generalAuthLimiter, ctrl.logout);

/**
 * POST /auth/refresh
 * Exchange refresh token (from cookie) for a new access token.
 * Body: { userId: string }
 */
router.post("/refresh", refreshLimiter, ctrl.refresh);

/**
 * POST /auth/forgot-password
 * Send password reset email. Always returns 200.
 */
router.post(
  "/forgot-password",
  passwordResetLimiter,
  validateForgotPassword,
  handleValidationErrors,
  ctrl.forgotPassword,
);

/**
 * POST /auth/reset-password
 * Reset password using token from email.
 * Body: { token: string, newPassword: string }
 */
router.post(
  "/reset-password",
  passwordResetLimiter,
  validateResetPassword,
  handleValidationErrors,
  ctrl.resetPassword,
);

// ─── Protected Endpoints ──────────────────────────────────────────────────────

/**
 * GET /auth/me
 * Get authenticated user's profile.
 */
router.get("/me", authenticate, generalAuthLimiter, ctrl.getMe);

// ─── Google OAuth ─────────────────────────────────────────────────────────────

/**
 * GET /auth/google
 * Initiate Google OAuth flow.
 */
router.get("/google", ctrl.googleAuth);

/**
 * GET /auth/google/callback
 * Google OAuth callback. Issues JWT, redirects to frontend.
 */
router.get(
  "/google/callback",
  passport.authenticate("google", {
    session: false,
    failureRedirect: `${process.env.FRONTEND_URL || "http://localhost:5173"}/login?error=google_auth_failed`,
  }),
  ctrl.googleCallback,
);

/**
 * POST /auth/google/verify
 * Google token authentication endpoint for GIS popup / token payload.
 */
router.post("/google/verify", generalAuthLimiter, ctrl.googleVerifyToken);

// ─── Admin Endpoints ──────────────────────────────────────────────────────────

/**
 * GET /auth/admin/users
 * List all users. Admin only.
 */
router.get(
  "/admin/users",
  authenticate,
  authorize("admin"),
  generalAuthLimiter,
  ctrl.listUsers,
);

export default router;
