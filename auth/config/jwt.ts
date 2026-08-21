/**
 * auth/config/jwt.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * JWT configuration constants and token type definitions.
 */

export const JWT_CONFIG = {
  /** Access token: short-lived, stateless */
  access: {
    secret: () => {
      const s = process.env.JWT_ACCESS_SECRET;
      if (!s) throw new Error("JWT_ACCESS_SECRET is not set");
      return s;
    },
    expiresIn: (process.env.JWT_ACCESS_EXPIRES_IN || "15m") as string,
  },
  /** Refresh token: long-lived, stored & revocable in DB */
  refresh: {
    secret: () => {
      const s = process.env.JWT_REFRESH_SECRET;
      if (!s) throw new Error("JWT_REFRESH_SECRET is not set");
      return s;
    },
    expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN || "7d") as string,
    /** Refresh token cookie name */
    cookieName: "truthai_rt",
  },
} as const;

/** Shape of the payload embedded in Access Tokens. */
export interface AccessTokenPayload {
  sub: string;       // user ID
  email: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}

/** Shape of the payload embedded in Refresh Tokens. */
export interface RefreshTokenPayload {
  sub: string;       // user ID
  jti: string;       // unique token ID (for DB lookup)
  iat?: number;
  exp?: number;
}

export type UserRole = "user" | "admin";
