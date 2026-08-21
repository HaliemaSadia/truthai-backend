-- ─────────────────────────────────────────────────────────────────────────────
-- TruthAI Auth Schema
-- Run this in your Supabase SQL editor (Dashboard → SQL Editor → New Query)
-- or via psql: psql $DATABASE_URL -f schema.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Users ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                       TEXT NOT NULL UNIQUE,
  password_hash               TEXT,                         -- NULL for Google-only accounts
  role                        TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  name                        TEXT,
  avatar_url                  TEXT,

  -- Email verification
  email_verified              BOOLEAN NOT NULL DEFAULT FALSE,
  verification_token          TEXT UNIQUE,
  verification_token_expires  TIMESTAMPTZ,

  -- Password reset
  reset_token                 TEXT UNIQUE,
  reset_token_expires         TIMESTAMPTZ,

  -- Google OAuth
  google_id                   TEXT UNIQUE,

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_users_email            ON users (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_users_google_id        ON users (google_id) WHERE google_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_verification_tok ON users (verification_token) WHERE verification_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_reset_token      ON users (reset_token) WHERE reset_token IS NOT NULL;

-- Auto-update updated_at on every row change
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Refresh Tokens ───────────────────────────────────────────────────────────
-- Stores bcrypt-hashed refresh tokens; one per login session.
-- Revoked on logout or password change; rotated on each use.
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL,                -- bcrypt hash — raw token never stored
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked     BOOLEAN NOT NULL DEFAULT FALSE,
  user_agent  TEXT,
  ip_address  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rt_user_id    ON refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_rt_token_hash ON refresh_tokens (token_hash);
CREATE INDEX IF NOT EXISTS idx_rt_active     ON refresh_tokens (user_id, revoked, expires_at)
  WHERE revoked = FALSE;

-- ─── Auth Events (Audit Log) ──────────────────────────────────────────────────
-- Append-only log of all auth actions. Passwords and tokens are NEVER logged.
CREATE TABLE IF NOT EXISTS auth_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  event       TEXT NOT NULL,               -- 'register', 'login', 'logout', etc.
  ip_address  TEXT,
  user_agent  TEXT,
  success     BOOLEAN NOT NULL,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_events_user_id   ON auth_events (user_id);
CREATE INDEX IF NOT EXISTS idx_auth_events_event      ON auth_events (event);
CREATE INDEX IF NOT EXISTS idx_auth_events_created_at ON auth_events (created_at DESC);

-- ─── Row-Level Security (RLS) ─────────────────────────────────────────────────
-- The backend uses the SERVICE ROLE key which bypasses RLS, so these policies
-- protect against direct client access (e.g., if anon key is ever used).

ALTER TABLE users          ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_events    ENABLE ROW LEVEL SECURITY;

-- Only the service role (backend) can read/write — deny all anon/public access
CREATE POLICY "service_role_only_users"
  ON users FOR ALL TO authenticated USING (FALSE);

CREATE POLICY "service_role_only_rt"
  ON refresh_tokens FOR ALL TO authenticated USING (FALSE);

CREATE POLICY "service_role_only_events"
  ON auth_events FOR ALL TO authenticated USING (FALSE);

-- ─── Cleanup function (run periodically via pg_cron or external cron) ─────────
-- Deletes refresh tokens that have expired (reduces table bloat).
CREATE OR REPLACE FUNCTION cleanup_expired_refresh_tokens()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  WITH deleted AS (
    DELETE FROM refresh_tokens
    WHERE expires_at < NOW()
    RETURNING id
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;
  RETURN deleted_count;
END;
$$;

-- ─── Sample admin seed (REMOVE before production) ─────────────────────────────
-- INSERT INTO users (email, role, email_verified, name)
-- VALUES ('admin@example.com', 'admin', TRUE, 'System Admin')
-- ON CONFLICT (email) DO NOTHING;
