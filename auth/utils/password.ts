/**
 * auth/utils/password.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * bcrypt password hashing utilities.
 * Uses cost factor 12 — ~250ms per hash, good balance for auth endpoints.
 */

import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;

/**
 * Hash a plain-text password.
 * @throws if password is empty or hashing fails
 */
export async function hashPassword(plain: string): Promise<string> {
  if (!plain || plain.length === 0) {
    throw new Error("Password cannot be empty");
  }
  return bcrypt.hash(plain, SALT_ROUNDS);
}

/**
 * Compare a plain-text password against a bcrypt hash.
 * Constant-time comparison — safe against timing attacks.
 */
export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  if (!plain || !hash) return false;
  return bcrypt.compare(plain, hash);
}

/**
 * Estimate the strength of a password.
 * Returns a score 0–4 (0 = very weak, 4 = strong).
 */
export function passwordStrength(password: string): number {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  return Math.min(score, 4);
}

/**
 * Validate that a password meets minimum security requirements:
 * - At least 8 characters
 * - At least one uppercase letter
 * - At least one number
 * - At least one special character
 */
export function validatePasswordPolicy(password: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  if (password.length < 8) errors.push("At least 8 characters required");
  if (!/[A-Z]/.test(password)) errors.push("At least one uppercase letter required");
  if (!/[0-9]/.test(password)) errors.push("At least one number required");
  if (!/[^A-Za-z0-9]/.test(password))
    errors.push("At least one special character required (!@#$%^&*)");
  return { valid: errors.length === 0, errors };
}
