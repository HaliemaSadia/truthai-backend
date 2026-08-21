/**
 * auth/services/email.service.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Email sending via Nodemailer (Gmail SMTP or any SMTP provider).
 * Templates for: email verification, password reset.
 */

import nodemailer, { type Transporter } from "nodemailer";
import { logger } from "../utils/logger.js";

let _transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (_transporter) return _transporter;

  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = parseInt(process.env.SMTP_PORT || "587");
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass) {
    logger.warn("SMTP credentials not configured. Emails will be logged only.");
    // Return a null transport for development
    _transporter = nodemailer.createTransport({ jsonTransport: true } as any);
    return _transporter;
  }

  _transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    pool: true,
    maxConnections: 5,
  });

  return _transporter;
}

const FROM = () =>
  process.env.SMTP_FROM || `TruthAI <noreply@${process.env.SMTP_USER || "example.com"}>`;

const APP_URL = () => process.env.APP_URL || "http://localhost:3000";
const APP_NAME = "TruthAI";

// ─── Email Templates ──────────────────────────────────────────────────────────

function baseTemplate(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    body { margin:0; padding:0; background:#f1f5f9; font-family:system-ui,-apple-system,sans-serif; }
    .container { max-width:560px; margin:40px auto; background:#fff; border-radius:16px; overflow:hidden; box-shadow:0 4px 24px rgba(0,0,0,.08); }
    .header { background:linear-gradient(135deg,#2563eb,#7c3aed); padding:32px; text-align:center; }
    .header h1 { color:#fff; margin:0; font-size:24px; }
    .body { padding:36px 40px; color:#1e293b; }
    .body p { line-height:1.7; color:#475569; }
    .btn { display:inline-block; margin:24px 0; padding:14px 32px; background:#2563eb; color:#fff!important;
           text-decoration:none; border-radius:10px; font-weight:700; font-size:15px; }
    .footer { padding:20px 40px; background:#f8fafc; text-align:center; font-size:12px; color:#94a3b8; }
    .code { font-family:monospace; background:#f1f5f9; padding:12px 20px; border-radius:8px;
            font-size:20px; letter-spacing:4px; text-align:center; margin:16px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header"><h1>${APP_NAME}</h1></div>
    <div class="body">${body}</div>
    <div class="footer">
      © ${new Date().getFullYear()} ${APP_NAME}. This is an automated message — please do not reply.
    </div>
  </div>
</body>
</html>`;
}

// ─── Email Functions ──────────────────────────────────────────────────────────

/** Send an email verification link after registration. */
export async function sendVerificationEmail(
  to: string,
  token: string,
): Promise<void> {
  const link = `${APP_URL()}/auth/verify-email?token=${token}`;
  const html = baseTemplate(
    "Verify your email",
    `<h2 style="margin-top:0">Verify your email address</h2>
     <p>Thanks for signing up! Please confirm your email address by clicking the button below.</p>
     <a href="${link}" class="btn">Verify Email</a>
     <p style="font-size:13px;color:#94a3b8;">Link expires in 24 hours. If you didn't create an account, you can ignore this email.</p>
     <p style="font-size:12px;color:#94a3b8;word-break:break-all;">Or paste this URL: ${link}</p>`,
  );

  await send({ to, subject: `Verify your ${APP_NAME} email`, html });
}

/** Send a password reset link. */
export async function sendPasswordResetEmail(
  to: string,
  token: string,
): Promise<void> {
  const link = `${APP_URL()}/auth/reset-password?token=${token}`;
  const html = baseTemplate(
    "Reset your password",
    `<h2 style="margin-top:0">Reset your password</h2>
     <p>We received a request to reset the password for your ${APP_NAME} account.</p>
     <a href="${link}" class="btn">Reset Password</a>
     <p style="font-size:13px;color:#94a3b8;">This link expires in <strong>1 hour</strong>. If you didn't request a password reset, you can safely ignore this email.</p>
     <p style="font-size:12px;color:#94a3b8;word-break:break-all;">Or paste this URL: ${link}</p>`,
  );

  await send({ to, subject: `Reset your ${APP_NAME} password`, html });
}

/** Low-level send with dev fallback (log to console if no SMTP). */
async function send(options: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  try {
    const transport = getTransporter();
    const info = await transport.sendMail({
      from: FROM(),
      ...options,
    });

    if (process.env.NODE_ENV !== "production") {
      // In dev with jsonTransport, log the email content
      logger.info("[EmailService] Email dispatched (dev mode)", {
        meta: { to: options.to, subject: options.subject, messageId: info.messageId },
      });
    }
  } catch (err) {
    // Don't throw — email failure should not block the auth response
    // Log it and let the user know they can request again
    logger.error("[EmailService] Failed to send email", {
      meta: { to: options.to, subject: options.subject, error: (err as Error).message },
    });
  }
}
