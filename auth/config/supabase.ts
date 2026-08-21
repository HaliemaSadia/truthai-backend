/**
 * auth/config/supabase.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Supabase client singleton using the SERVICE ROLE key (server-side only).
 * NEVER expose this client or its key to the frontend.
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (_client) return _client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables",
    );
  }

  _client = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return _client;
}

/** Typed DB helper — returns the Supabase client. */
export const db = () => getSupabaseClient();
