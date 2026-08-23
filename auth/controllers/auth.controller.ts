/**
 * auth/controllers/auth.controller.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * HTTP request handlers for all auth endpoints.
 * Thin layer: parses req, calls service, formats res.
 */

import type { Request, Response } from "express";
import passport from "passport";
import * as AuthService from "../services/auth.service.js";
import { refreshTokens } from "../services/auth.service.js";
import { issueAccessToken } from "../services/token.service.js";
import { refreshCookieOptions } from "../services/token.service.js";
import { UserModel, toPublicUser } from "../models/user.model.js";
import { JWT_CONFIG } from "../config/jwt.js";
import { logger } from "../utils/logger.js";

const COOKIE = JWT_CONFIG.refresh.cookieName;

// ─── Helper ───────────────────────────────────────────────────────────────────

function getClientMeta(req: Request) {
  return {
    ip: (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      req.socket.remoteAddress ||
      req.ip,
    userAgent: req.headers["user-agent"],
  };
}

// ─── POST /auth/register ──────────────────────────────────────────────────────

export async function register(req: Request, res: Response): Promise<void> {
  try {
    const { email, password, name } = req.body;
    const { ip, userAgent } = getClientMeta(req);

    const result = await AuthService.registerUser({ email, password, name, ip, userAgent });

    res.status(201).json({ success: true, ...result });
  } catch (err: any) {
    if (err.name === "AuthError") {
      res.status(err.statusCode).json({ success: false, error: err.message, code: err.code });
    } else {
      logger.error("Register error", { error: err });
      res.status(500).json({ success: false, error: "Internal server error during registration." });
    }
  }
}

// ─── GET /auth/verify-email ───────────────────────────────────────────────────

export async function verifyEmail(req: Request, res: Response): Promise<void> {
  try {
    const token = req.query.token as string;
    if (!token) {
      res.status(400).json({ success: false, error: "Verification token is required.", code: "MISSING_TOKEN" });
      return;
    }

    await AuthService.verifyEmail(token);

    // Redirect to frontend with success flag
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    res.redirect(`${frontendUrl}/login?verified=true`);
  } catch (err: any) {
    if (err.name === "AuthError") {
      res.status(err.statusCode).json({ success: false, error: err.message, code: err.code });
    } else {
      logger.error("Verify email error", { error: err });
      res.status(500).json({ success: false, error: "Internal server error during email verification." });
    }
  }
}

// ─── POST /auth/login ─────────────────────────────────────────────────────────

export async function login(req: Request, res: Response): Promise<void> {
  try {
    const { email, password } = req.body;
    const { ip, userAgent } = getClientMeta(req);

    const { accessToken, refreshToken, user } = await AuthService.loginUser({
      email, password, ip, userAgent,
    });

    // Set refresh token as httpOnly cookie
    res.cookie(COOKIE, refreshToken, refreshCookieOptions());

    res.status(200).json({
      success: true,
      message: "Login successful.",
      accessToken,
      user,
    });
  } catch (err: any) {
    if (err.name === "AuthError") {
      res.status(err.statusCode).json({ success: false, error: err.message, code: err.code });
    } else {
      logger.error("Login error", { error: err });
      res.status(500).json({ success: false, error: "Internal server error during login." });
    }
  }
}

// ─── POST /auth/logout ────────────────────────────────────────────────────────

export async function logout(req: Request, res: Response): Promise<void> {
  try {
    const rawRefreshToken = req.cookies?.[COOKIE];
    const { ip, userAgent } = getClientMeta(req);
    const userId = req.user?.id;

    if (userId && rawRefreshToken) {
      await AuthService.logoutUser({ userId, rawRefreshToken, ip, userAgent });
    }

    res.clearCookie(COOKIE, refreshCookieOptions());
    res.status(200).json({ success: true, message: "Logged out successfully." });
  } catch (err: any) {
    logger.error("Logout error", { error: err });
    // Always succeed from client perspective
    res.clearCookie(COOKIE, refreshCookieOptions());
    res.status(200).json({ success: true, message: "Logged out." });
  }
}

// ─── POST /auth/refresh ───────────────────────────────────────────────────────

export async function refresh(req: Request, res: Response): Promise<void> {
  try {
    const rawRefreshToken = req.cookies?.[COOKIE];
    const rawCookieHeader = req.headers.cookie;
    const userId = req.body?.userId as string;

    console.log("[DEBUG POST /auth/refresh] Request received:", {
      rawCookieHeader: rawCookieHeader || "none",
      cookiesObj: req.cookies,
      extractedRefreshToken: rawRefreshToken || "missing",
      userIdPassedInBody: userId || "missing",
    });

    if (!rawRefreshToken) {
      res.status(401).json({ success: false, error: "No refresh token provided.", code: "NO_REFRESH_TOKEN" });
      return;
    }

    if (!userId) {
      res.status(401).json({ success: false, error: "User ID required for token refresh.", code: "MISSING_USER_ID" });
      return;
    }

    const { ip, userAgent } = getClientMeta(req);
    const { accessToken, newRefreshToken } = await refreshTokens({
      userId,
      rawRefreshToken,
      ip,
      userAgent,
    });

    // Rotate cookie
    res.cookie(COOKIE, newRefreshToken, refreshCookieOptions());

    res.status(200).json({
      success: true,
      message: "Token refreshed.",
      accessToken,
    });
  } catch (err: any) {
    if (err.name === "AuthError") {
      res.clearCookie(COOKIE, refreshCookieOptions());
      res.status(err.statusCode).json({ success: false, error: err.message, code: err.code });
    } else {
      logger.error("Refresh error", { error: err });
      res.status(500).json({ success: false, error: "Internal server error during token refresh." });
    }
  }
}

// ─── POST /auth/forgot-password ───────────────────────────────────────────────

export async function forgotPassword(req: Request, res: Response): Promise<void> {
  try {
    const { email } = req.body;
    const { ip } = getClientMeta(req);
    await AuthService.forgotPassword({ email, ip });

    // OWASP: Always return 200 to prevent email enumeration
    res.status(200).json({
      success: true,
      message: "If an account with that email exists, a password reset link has been sent.",
    });
  } catch (err: any) {
    logger.error("Forgot password error", { error: err });
    res.status(200).json({
      success: true,
      message: "If an account with that email exists, a password reset link has been sent.",
    });
  }
}

// ─── POST /auth/reset-password ────────────────────────────────────────────────

export async function resetPassword(req: Request, res: Response): Promise<void> {
  try {
    const { token, newPassword } = req.body;
    const { ip } = getClientMeta(req);
    await AuthService.resetPassword({ token, newPassword, ip });

    res.status(200).json({
      success: true,
      message: "Password has been reset successfully. Please log in with your new password.",
    });
  } catch (err: any) {
    if (err.name === "AuthError") {
      res.status(err.statusCode).json({ success: false, error: err.message, code: err.code });
    } else {
      logger.error("Reset password error", { error: err });
      res.status(500).json({ success: false, error: "Internal server error during password reset." });
    }
  }
}

// ─── GET /auth/me ─────────────────────────────────────────────────────────────

export async function getMe(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, error: "Not authenticated.", code: "NOT_AUTHENTICATED" });
      return;
    }

    const user = await UserModel.findById(userId);
    if (!user) {
      res.status(404).json({ success: false, error: "User not found.", code: "USER_NOT_FOUND" });
      return;
    }

    res.status(200).json({ success: true, user: toPublicUser(user) });
  } catch (err: any) {
    logger.error("GetMe error", { error: err });
    res.status(500).json({ success: false, error: "Internal server error." });
  }
}

export function googleAuth(req: Request, res: Response, next: any): void {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    const frontendUrl = process.env.FRONTEND_URL || "https://halima-ai.supertechholding.com";
    return res.redirect(`${frontendUrl}/?error=google_not_configured`);
  }
  passport.authenticate("google", {
    scope: ["profile", "email"],
    session: false,
  })(req, res, next);
}

// ─── GET /auth/google/callback ────────────────────────────────────────────────

export async function googleCallback(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user as any;
    if (!user) {
      const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
      res.redirect(`${frontendUrl}/login?error=google_auth_failed`);
      return;
    }

    // Issue JWT tokens
    const accessToken = issueAccessToken({ userId: user.id, email: user.email, role: user.role });
    const { issueRefreshToken: issueRT, refreshCookieOptions: rtCookieOpts } = await import("../services/token.service.js");
    const { ip, userAgent } = getClientMeta(req);
    const refreshToken = await issueRT(user.id, { userAgent, ipAddress: ip });

    res.cookie(COOKIE, refreshToken, rtCookieOpts());

    // Redirect to frontend with access token in URL fragment (SPA picks it up)
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    res.redirect(`${frontendUrl}/oauth/callback#access_token=${accessToken}&user_id=${user.id}`);
  } catch (err: any) {
    logger.error("Google callback error", { error: err });
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    res.redirect(`${frontendUrl}/login?error=internal_error`);
  }
}

// ─── POST /auth/google/verify ─────────────────────────────────────────────────

export async function googleVerifyToken(req: Request, res: Response): Promise<void> {
  try {
    const { email, name, picture, googleId } = req.body;
    if (!email) {
      res.status(400).json({ success: false, error: "Email is required for Google authentication." });
      return;
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    let user = await UserModel.findByEmail(normalizedEmail);

    if (user) {
      user = await UserModel.updateById(user.id, {
        email_verified: true,
        google_id: googleId || user.google_id || `google-${Date.now()}`,
        avatar_url: picture || user.avatar_url,
        name: user.name || name || normalizedEmail.split("@")[0],
      });
    } else {
      user = await UserModel.create({
        email: normalizedEmail,
        google_id: googleId || `google-${Date.now()}`,
        avatar_url: picture || null,
        name: name || normalizedEmail.split("@")[0],
        role: "user",
        email_verified: true,
        password_hash: null,
      });
    }

    if (!user) {
      res.status(500).json({ success: false, error: "Failed to authenticate Google user." });
      return;
    }

    const accessToken = issueAccessToken({ userId: user.id, email: user.email, role: user.role });
    const { issueRefreshToken: issueRT, refreshCookieOptions: rtCookieOpts } = await import("../services/token.service.js");
    const { ip, userAgent } = getClientMeta(req);
    const refreshToken = await issueRT(user.id, { userAgent, ipAddress: ip });

    res.cookie(COOKIE, refreshToken, rtCookieOpts());
    res.status(200).json({
      success: true,
      accessToken,
      user: toPublicUser(user),
    });
  } catch (err: any) {
    logger.error("Google verify token error", { error: err });
    res.status(500).json({ success: false, error: "Google authentication failed." });
  }
}

// ─── GET /api/admin/users (Admin only) ───────────────────────────────────────

export async function listUsers(req: Request, res: Response): Promise<void> {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const { users, total } = await UserModel.listAll(page, limit);

    res.status(200).json({
      success: true,
      users,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err: any) {
    logger.error("ListUsers error", { error: err });
    res.status(500).json({ success: false, error: "Internal server error." });
  }
}