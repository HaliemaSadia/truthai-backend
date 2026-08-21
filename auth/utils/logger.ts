/**
 * auth/utils/logger.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Structured Winston logger for auth events.
 * SECURITY: Never logs passwords, API keys, or raw tokens.
 */

import { createLogger, format, transports } from "winston";

const SENSITIVE_KEYS = new Set([
  "password", "password_hash", "token", "accessToken", "refreshToken",
  "secret", "apiKey", "OPENAI_API_KEY", "authorization",
]);

/** Scrub any sensitive fields from log metadata before writing. */
const scrubSensitive = format((info) => {
  if (info.meta && typeof info.meta === "object") {
    const scrubbed: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(info.meta as Record<string, unknown>)) {
      scrubbed[k] = SENSITIVE_KEYS.has(k.toLowerCase()) ? "[REDACTED]" : v;
    }
    info.meta = scrubbed;
  }
  return info;
});

export const logger = createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: format.combine(
    scrubSensitive(),
    format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    format.errors({ stack: true }),
    process.env.NODE_ENV === "production"
      ? format.json()
      : format.combine(
          format.colorize(),
          format.printf(({ timestamp, level, message, ...rest }) => {
            const extra = Object.keys(rest).length
              ? "\n" + JSON.stringify(rest, null, 2)
              : "";
            return `${timestamp} [${level}] ${message}${extra}`;
          }),
        ),
  ),
  transports: [
    new transports.Console(),
    ...(process.env.NODE_ENV === "production"
      ? [
          new transports.File({ filename: "logs/auth-error.log", level: "error" }),
          new transports.File({ filename: "logs/auth-combined.log" }),
        ]
      : []),
  ],
});

/** Log an auth event (safe wrapper). */
export function logAuthEvent(event: {
  event: string;
  userId?: string;
  email?: string;
  ip?: string;
  userAgent?: string;
  success: boolean;
  reason?: string;
}) {
  logger.info(`AUTH_EVENT: ${event.event}`, {
    meta: {
      ...event,
      // Mask partial email for privacy: j***@example.com
      email: event.email
        ? event.email.replace(/^(.{1,2}).*(@.*)$/, "$1***$2")
        : undefined,
    },
  });
}
