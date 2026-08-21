/**
 * auth/middleware/validate.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * express-validator schemas for all auth endpoint inputs.
 * Returns 422 Unprocessable Entity on validation failure.
 */

import { body, validationResult, type ValidationChain } from "express-validator";
import type { Request, Response, NextFunction } from "express";

// ─── Reusable field validators ────────────────────────────────────────────────

const emailField = () =>
  body("email")
    .isEmail()
    .withMessage("A valid email address is required.")
    .normalizeEmail()
    .toLowerCase();

const passwordField = (field = "password") =>
  body(field)
    .isString()
    .withMessage("Password must be a string.")
    .isLength({ min: 8, max: 128 })
    .withMessage("Password must be between 8 and 128 characters.");

// ─── Validation schemas ───────────────────────────────────────────────────────

export const validateRegister: ValidationChain[] = [
  emailField(),
  passwordField(),
  body("name")
    .optional()
    .isString()
    .trim()
    .isLength({ max: 100 })
    .withMessage("Name must be at most 100 characters."),
];

export const validateLogin: ValidationChain[] = [emailField(), passwordField()];

export const validateForgotPassword: ValidationChain[] = [emailField()];

export const validateResetPassword: ValidationChain[] = [
  body("token")
    .isString()
    .isLength({ min: 64, max: 64 })
    .withMessage("Invalid reset token."),
  passwordField("newPassword"),
];

export const validateRefresh: ValidationChain[] = [
  // Refresh token comes from httpOnly cookie — no body validation needed
  // But we validate userId if sent in body (alternative flow)
];

// ─── Error formatter middleware ───────────────────────────────────────────────

/**
 * Run after validation chains. Returns 422 if any field fails.
 */
export function handleValidationErrors(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(422).json({
      success: false,
      error: "Validation Error",
      message: "One or more fields failed validation.",
      code: "VALIDATION_FAILED",
      errors: errors.array().map((e) => ({
        field: e.type === "field" ? e.path : undefined,
        message: e.msg,
      })),
    });
    return;
  }
  next();
}
