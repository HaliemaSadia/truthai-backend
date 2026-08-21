/**
 * auth/config/passport.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Passport.js Google OAuth 2.0 strategy.
 * Creates or finds a user from the Google profile, linking google_id.
 */

import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { UserModel } from "../models/user.model.js";
import { logger } from "../utils/logger.js";

export function configurePassport() {
  const clientID = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const callbackURL = process.env.GOOGLE_CALLBACK_URL ||
    "http://localhost:3000/auth/google/callback";

  if (!clientID || !clientSecret) {
    logger.warn(
      "Google OAuth not configured (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET missing). " +
      "Google login will be disabled.",
    );
    return;
  }

  passport.use(
    new GoogleStrategy(
      { clientID, clientSecret, callbackURL },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value;
          if (!email) {
            return done(new Error("No email provided by Google"), false);
          }

          // Find existing user by google_id or email
          let user = await UserModel.findByGoogleId(profile.id);

          if (!user) {
            user = await UserModel.findByEmail(email);

            if (user) {
              // Link Google account to existing email user
              user = await UserModel.updateById(user.id, {
                google_id: profile.id,
                avatar_url: profile.photos?.[0]?.value,
                email_verified: true,
                name: user.name || profile.displayName,
              });
            } else {
              // Create new user from Google
              user = await UserModel.create({
                email,
                google_id: profile.id,
                avatar_url: profile.photos?.[0]?.value,
                name: profile.displayName,
                role: "user",
                email_verified: true,
                password_hash: null,
              });
            }
          }

          if (!user) {
            return done(new Error("Failed to create or find user"), false);
          }

          return done(null, user);
        } catch (err) {
          logger.error("Google OAuth strategy error", { error: err });
          return done(err as Error, false);
        }
      },
    ),
  );

  // Stateless: we don't use sessions — we issue JWTs in the callback handler
  passport.serializeUser((user: any, done) => done(null, user.id));
  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await UserModel.findById(id);
      done(null, user);
    } catch (err) {
      done(err);
    }
  });
}
