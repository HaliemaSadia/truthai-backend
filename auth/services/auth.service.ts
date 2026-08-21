/**
 * auth/services/auth.service.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Core authentication business logic.
 * Controllers call these; services talk to models.
 */

import crypto from "crypto";
import { UserModel, AuthEventModel, toPublicUser, type PublicUser } from "../models/user.model.js";
import { hashPassword, verifyPassword, validatePasswordPolicy } from "../utils/password.js";
import { issueAccessToken, issueRefreshToken, validateAndRotateRefreshToken, revokeRefreshToken } from "./token.service.js";
import { sendVerificationEmail, sendPasswordResetEmail } from "./email.service.js";
import { logAuthEvent } from "../utils/logger.js";

// ─── Error types ──────────────────────────────────────────────────────────────

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 400,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

// ─── Register ─────────────────────────────────────────────────────────────────

export async function registerUser(input: {
  email: string;
  password: string;
  name?: string;
  ip?: string;
  userAgent?: string;
}): Promise<{ message: string }> {
  // 1. Validate password policy
  const { valid, errors } = validatePasswordPolicy(input.password);
  if (!valid) {
    throw new AuthError(`Password does not meet requirements: ${errors.join("; ")}`, 400, "WEAK_PASSWORD");
  }

  // 2. Check for existing email
  const existing = await UserModel.findByEmail(input.email);
  if (existing) {
    // Constant-time delay to prevent timing-based email enumeration
    await new Promise((r) => setTimeout(r, 300));
    throw new AuthError("An account with this email already exists.", 409, "EMAIL_EXISTS");
  }

  // 3. Hash password
  const password_hash = await hashPassword(input.password);

  // 4. Generate verification token
  const verificationToken = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  // 5. Create user
  const user = await UserModel.create({
    email: input.email.toLowerCase().trim(),
    password_hash,
    role: "user",
    name: input.name?.trim() || null,
    google_id: null,
    avatar_url: null,
    email_verified: false,
  });

  // 6. Store verification token
  await UserModel.updateById(user.id, {
    verification_token: verificationToken,
    verification_token_expires: expires.toISOString(),
  });

  // 7. Send verification email
  await sendVerificationEmail(user.email, verificationToken);

  // 8. Audit log
  await AuthEventModel.log({
    user_id: user.id,
    event: "register",
    ip_address: input.ip,
    user_agent: input.userAgent,
    success: true,
  });

  logAuthEvent({ event: "register", userId: user.id, email: user.email, ip: input.ip, success: true });

  return {
    message: "Registration successful. Please check your email to verify your account.",
    ...(process.env.NODE_ENV !== "production" ? { debugVerificationToken: verificationToken } : {}),
  };
}

// ─── Verify Email ─────────────────────────────────────────────────────────────

export async function verifyEmail(token: string): Promise<void> {
  const user = await UserModel.findByVerificationToken(token);
  if (!user) {
    throw new AuthError("Invalid or expired verification token.", 400, "INVALID_TOKEN");
  }

  if (user.email_verified) {
    throw new AuthError("Email is already verified.", 400, "ALREADY_VERIFIED");
  }

  if (
    user.verification_token_expires &&
    new Date(user.verification_token_expires) < new Date()
  ) {
    throw new AuthError("Verification token has expired. Please request a new one.", 400, "TOKEN_EXPIRED");
  }

  await UserModel.updateById(user.id, {
    email_verified: true,
    verification_token: null,
    verification_token_expires: null,
  });

  logAuthEvent({ event: "email_verified", userId: user.id, email: user.email, success: true });
}

// ─── Login ────────────────────────────────────────────────────────────────────

export async function loginUser(input: {
  email: string;
  password: string;
  ip?: string;
  userAgent?: string;
}): Promise<{ accessToken: string; refreshToken: string; user: PublicUser }> {
  const fail = (reason: string) => {
    logAuthEvent({ event: "login_failed", email: input.email, ip: input.ip, success: false, reason });
    throw new AuthError("Invalid email or password.", 401, "INVALID_CREDENTIALS");
  };

  // 1. Find user
  const user = await UserModel.findByEmail(input.email);
  if (!user) {
    // Still run bcrypt to prevent timing attack
    await hashPassword("dummy_timing_prevention");
    return fail("user_not_found") as never;
  }

  // 2. Must have a password (Google-only accounts can't use email login)
  if (!user.password_hash) {
    return fail("no_password") as never;
  }

  // 3. Verify password
  const valid = await verifyPassword(input.password, user.password_hash);
  if (!valid) return fail("wrong_password") as never;

  // 4. Check email verified
  if (!user.email_verified) {
    throw new AuthError(
      "Please verify your email address before logging in. Check your inbox.",
      403,
      "EMAIL_NOT_VERIFIED",
    );
  }

  // 5. Issue tokens
  const accessToken = issueAccessToken({ userId: user.id, email: user.email, role: user.role });
  const refreshToken = await issueRefreshToken(user.id, {
    userAgent: input.userAgent,
    ipAddress: input.ip,
  });

  // 6. Audit log
  await AuthEventModel.log({
    user_id: user.id,
    event: "login",
    ip_address: input.ip,
    user_agent: input.userAgent,
    success: true,
  });

  logAuthEvent({ event: "login", userId: user.id, email: user.email, ip: input.ip, success: true });

  return { accessToken, refreshToken, user: toPublicUser(user) };
}

// ─── Logout ───────────────────────────────────────────────────────────────────

export async function logoutUser(input: {
  userId: string;
  rawRefreshToken: string;
  ip?: string;
  userAgent?: string;
}): Promise<void> {
  await revokeRefreshToken(input.userId, input.rawRefreshToken);

  await AuthEventModel.log({
    user_id: input.userId,
    event: "logout",
    ip_address: input.ip,
    user_agent: input.userAgent,
    success: true,
  });

  logAuthEvent({ event: "logout", userId: input.userId, ip: input.ip, success: true });
}

// ─── Refresh ──────────────────────────────────────────────────────────────────

export async function refreshTokens(input: {
  userId: string;
  rawRefreshToken: string;
  ip?: string;
  userAgent?: string;
}): Promise<{ accessToken: string; newRefreshToken: string }> {
  const user = await UserModel.findById(input.userId);
  if (!user) throw new AuthError("User not found.", 401, "USER_NOT_FOUND");

  const result = await validateAndRotateRefreshToken(input.userId, input.rawRefreshToken, {
    userAgent: input.userAgent,
    ipAddress: input.ip,
  });

  if (!result) {
    // Possible token reuse attack — revoke all tokens for this user
    await (await import("../models/user.model.js")).RefreshTokenModel.revokeAllForUser(input.userId);
    logAuthEvent({ event: "refresh_reuse_attack", userId: input.userId, ip: input.ip, success: false });
    throw new AuthError("Invalid or expired refresh token.", 401, "INVALID_REFRESH_TOKEN");
  }

  const accessToken = issueAccessToken({ userId: user.id, email: user.email, role: user.role });
  return { accessToken, newRefreshToken: result.newRawToken };
}

// ─── Forgot Password ──────────────────────────────────────────────────────────

export async function forgotPassword(input: {
  email: string;
  ip?: string;
}): Promise<{ debugResetToken?: string }> {
  // OWASP: Always return 200 — never reveal if email exists
  const user = await UserModel.findByEmail(input.email);

  if (user) {
    const token = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await UserModel.updateById(user.id, {
      reset_token: token,
      reset_token_expires: expires.toISOString(),
    });

    await sendPasswordResetEmail(user.email, token);
    logAuthEvent({ event: "forgot_password", userId: user.id, email: user.email, ip: input.ip, success: true });
    return process.env.NODE_ENV !== "production" ? { debugResetToken: token } : {};
  }
  return {};
}

// ─── Reset Password ───────────────────────────────────────────────────────────

export async function resetPassword(input: {
  token: string;
  newPassword: string;
  ip?: string;
}): Promise<void> {
  const { valid, errors } = validatePasswordPolicy(input.newPassword);
  if (!valid) {
    throw new AuthError(`Password does not meet requirements: ${errors.join("; ")}`, 400, "WEAK_PASSWORD");
  }

  const user = await UserModel.findByResetToken(input.token);
  if (!user) throw new AuthError("Invalid or expired reset token.", 400, "INVALID_TOKEN");

  if (!user.reset_token_expires || new Date(user.reset_token_expires) < new Date()) {
    throw new AuthError("Reset token has expired. Please request a new one.", 400, "TOKEN_EXPIRED");
  }

  const password_hash = await hashPassword(input.newPassword);

  await UserModel.updateById(user.id, {
    password_hash,
    reset_token: null,
    reset_token_expires: null,
  });

  // Revoke all refresh tokens — force re-login everywhere
  const { RefreshTokenModel } = await import("../models/user.model.js");
  await RefreshTokenModel.revokeAllForUser(user.id);

  logAuthEvent({ event: "password_reset", userId: user.id, email: user.email, ip: input.ip, success: true });
}
