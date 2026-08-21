/**
 * auth/services/token.service.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * JWT issuance, verification, and refresh token lifecycle management.
 */

import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { JWT_CONFIG, type AccessTokenPayload, type RefreshTokenPayload, type UserRole } from "../config/jwt.js";
import { RefreshTokenModel } from "../models/user.model.js";

// ─── Access Token ─────────────────────────────────────────────────────────────

/** Issue a short-lived Access Token (default 15 minutes). */
export function issueAccessToken(payload: {
  userId: string;
  email: string;
  role: UserRole;
}): string {
  return jwt.sign(
    { sub: payload.userId, email: payload.email, role: payload.role } satisfies Omit<AccessTokenPayload, "iat" | "exp">,
    JWT_CONFIG.access.secret(),
    { expiresIn: JWT_CONFIG.access.expiresIn as any, algorithm: "HS256" },
  );
}

/** Verify and decode an Access Token. Throws on invalid/expired. */
export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, JWT_CONFIG.access.secret(), {
    algorithms: ["HS256"],
  }) as AccessTokenPayload;
}

// ─── Refresh Token ────────────────────────────────────────────────────────────

const REFRESH_TOKEN_BYTES = 48; // 384 bits → 64-char hex

/** Generate a cryptographically random refresh token. */
function generateRefreshTokenRaw(): string {
  return crypto.randomBytes(REFRESH_TOKEN_BYTES).toString("hex");
}

/** Hash a raw refresh token for DB storage (one-way). */
async function hashRefreshToken(raw: string): Promise<string> {
  // bcrypt cost 8 — lower than password; refresh tokens are already random
  return bcrypt.hash(raw, 8);
}

/** Compare a raw token against a stored bcrypt hash. */
async function matchRefreshToken(raw: string, hash: string): Promise<boolean> {
  return bcrypt.compare(raw, hash);
}

/** Parse "7d", "24h" etc. → milliseconds for Date arithmetic. */
function parseDuration(dur: string): number {
  const map: Record<string, number> = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  const match = dur.match(/^(\d+)([smhd])$/);
  if (!match) throw new Error(`Invalid duration: ${dur}`);
  return parseInt(match[1]) * (map[match[2]] ?? 0);
}

/**
 * Issue a new Refresh Token:
 * 1. Generates random bytes
 * 2. Stores a bcrypt hash in the DB
 * 3. Returns the raw token (to be sent to client via httpOnly cookie)
 */
export async function issueRefreshToken(
  userId: string,
  meta: { userAgent?: string; ipAddress?: string },
): Promise<string> {
  const raw = generateRefreshTokenRaw();
  const hash = await hashRefreshToken(raw);
  // Ensure expires_at is constructed as valid UTC Date
  const expiresAt = new Date(
    Date.now() + parseDuration(JWT_CONFIG.refresh.expiresIn),
  );

  await RefreshTokenModel.create({
    user_id: userId,
    token_hash: hash,
    expires_at: expiresAt,
    user_agent: meta.userAgent,
    ip_address: meta.ipAddress,
  });

  return raw;
}

/**
 * Validate a raw refresh token against all stored hashes for a user.
 * Returns the matching DB record or null.
 *
 * NOTE: We can't do a single-query lookup because bcrypt hashes are not
 * deterministic. We therefore store only one active token per user for
 * efficiency (rotate on each use).
 */
export async function validateAndRotateRefreshToken(
  userId: string,
  rawToken: string,
  meta: { userAgent?: string; ipAddress?: string },
): Promise<{ newRawToken: string } | null> {
  const nowIso = new Date().toISOString();

  // Fetch all non-revoked, non-expired tokens for this user
  const { data: tokens, error } = await (await import("../config/supabase.js"))
    .db()
    .from("refresh_tokens")
    .select("*")
    .eq("user_id", userId)
    .eq("revoked", false)
    .gt("expires_at", nowIso);

  const activeCount = tokens ? tokens.length : 0;
  console.log(`[DEBUG validateAndRotateRefreshToken] userId: ${userId}, active non-expired tokens count: ${activeCount}, queryError: ${error ? error.message : "none"}`);

  if (error || !tokens?.length) return null;

  // Find the matching token (compare against all stored hashes)
  let matchedHash: string | null = null;
  for (const t of tokens) {
    const isMatch = await matchRefreshToken(rawToken, t.token_hash);
    console.log(`[DEBUG matchRefreshToken] hash: ${t.token_hash.slice(0, 15)}... match result: ${isMatch}`);
    if (isMatch) {
      matchedHash = t.token_hash;
      break;
    }
  }

  if (!matchedHash) {
    console.log("[DEBUG validateAndRotateRefreshToken] Bcrypt comparison failed for all active tokens.");
    return null;
  }

  // Revoke the used token
  await RefreshTokenModel.revokeByHash(matchedHash);

  // Issue a new one (rotation)
  const newRaw = await issueRefreshToken(userId, meta);
  return { newRawToken: newRaw };
}

/** Revoke a specific raw refresh token (logout). */
export async function revokeRefreshToken(
  userId: string,
  rawToken: string,
): Promise<void> {
  const { data: tokens } = await (await import("../config/supabase.js"))
    .db()
    .from("refresh_tokens")
    .select("token_hash")
    .eq("user_id", userId)
    .eq("revoked", false);

  if (!tokens?.length) return;

  for (const t of tokens) {
    if (await matchRefreshToken(rawToken, t.token_hash)) {
      await RefreshTokenModel.revokeByHash(t.token_hash);
      return;
    }
  }
}

/** Build options for the httpOnly refresh token cookie. */
export function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
    path: "/",
  };
}