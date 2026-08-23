/**
 * auth/models/user.model.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Resilient Data Access Layer for users, refresh_tokens, and auth_events.
 * Attempts Supabase DB queries first; falls back to an in-memory store if tables
 * haven't been migrated yet on Supabase.
 */

import { db } from "../config/supabase.js";
import type { UserRole } from "../config/jwt.js";
import crypto from "crypto";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  password_hash: string | null;
  role: UserRole;
  email_verified: boolean;
  verification_token: string | null;
  verification_token_expires: string | null;
  reset_token: string | null;
  reset_token_expires: string | null;
  google_id: string | null;
  avatar_url: string | null;
  name: string | null;
  is_pro?: boolean;
  subscription_expires_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PublicUser {
  id: string;
  email: string;
  role: UserRole;
  email_verified: boolean;
  avatar_url: string | null;
  name: string | null;
  is_pro?: boolean;
  subscription_expires_at?: string | null;
  created_at: string;
}

export interface RefreshToken {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  revoked: boolean;
  user_agent: string | null;
  ip_address: string | null;
  created_at: string;
}

export type CreateUserInput = Pick<
  User,
  | "email"
  | "password_hash"
  | "role"
  | "name"
  | "google_id"
  | "avatar_url"
  | "email_verified"
>;

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    email_verified: user.email_verified,
    avatar_url: user.avatar_url,
    name: user.name,
    is_pro: !!user.is_pro,
    subscription_expires_at: user.subscription_expires_at || null,
    created_at: user.created_at,
  };
}

// ─── In-Memory Fallback Store ────────────────────────────────────────────────
const memoryUsers = new Map<string, User>();
const memoryRefreshTokens: RefreshToken[] = [];
const memoryAuthEvents: any[] = [];

function isTableMissingError(error: any): boolean {
  if (!error) return false;
  const msg = (error.message || "").toLowerCase();
  return (
    msg.includes("schema cache") ||
    msg.includes("does not exist") ||
    error.code === "PGRST202" ||
    error.code === "42P01"
  );
}

// ─── UserModel ───────────────────────────────────────────────────────────────

export const UserModel = {
  async findByEmail(email: string): Promise<User | null> {
    try {
      const { data, error } = await db()
        .from("users")
        .select("*")
        .ilike("email", email)
        .maybeSingle();
      if (error) {
        if (isTableMissingError(error)) throw error;
        throw error;
      }
      return data as User | null;
    } catch (err: any) {
      if (isTableMissingError(err)) {
        const lower = email.toLowerCase().trim();
        for (const u of memoryUsers.values()) {
          if (u.email.toLowerCase() === lower) return u;
        }
        return null;
      }
      throw err;
    }
  },

  async findById(id: string): Promise<User | null> {
    try {
      const { data, error } = await db()
        .from("users")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) {
        if (isTableMissingError(error)) throw error;
        throw error;
      }
      return data as User | null;
    } catch (err: any) {
      if (isTableMissingError(err)) {
        return memoryUsers.get(id) || null;
      }
      throw err;
    }
  },

  async findByGoogleId(googleId: string): Promise<User | null> {
    try {
      const { data, error } = await db()
        .from("users")
        .select("*")
        .eq("google_id", googleId)
        .maybeSingle();
      if (error) {
        if (isTableMissingError(error)) throw error;
        throw error;
      }
      return data as User | null;
    } catch (err: any) {
      if (isTableMissingError(err)) {
        for (const u of memoryUsers.values()) {
          if (u.google_id === googleId) return u;
        }
        return null;
      }
      throw err;
    }
  },

  async findByVerificationToken(token: string): Promise<User | null> {
    try {
      const { data, error } = await db()
        .from("users")
        .select("*")
        .eq("verification_token", token)
        .maybeSingle();
      if (error) {
        if (isTableMissingError(error)) throw error;
        throw error;
      }
      return data as User | null;
    } catch (err: any) {
      if (isTableMissingError(err)) {
        for (const u of memoryUsers.values()) {
          if (u.verification_token === token) return u;
        }
        return null;
      }
      throw err;
    }
  },

  async findByResetToken(token: string): Promise<User | null> {
    try {
      const { data, error } = await db()
        .from("users")
        .select("*")
        .eq("reset_token", token)
        .maybeSingle();
      if (error) {
        if (isTableMissingError(error)) throw error;
        throw error;
      }
      return data as User | null;
    } catch (err: any) {
      if (isTableMissingError(err)) {
        for (const u of memoryUsers.values()) {
          if (u.reset_token === token) return u;
        }
        return null;
      }
      throw err;
    }
  },

  async create(input: CreateUserInput): Promise<User> {
    const newUser: User = {
      id: crypto.randomUUID(),
      email: input.email.toLowerCase().trim(),
      password_hash: input.password_hash ?? null,
      role: input.role ?? "user",
      email_verified: input.email_verified ?? false,
      verification_token: null,
      verification_token_expires: null,
      reset_token: null,
      reset_token_expires: null,
      google_id: input.google_id ?? null,
      avatar_url: input.avatar_url ?? null,
      name: input.name ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    try {
      const { data, error } = await db()
        .from("users")
        .insert({
          email: newUser.email,
          password_hash: newUser.password_hash,
          role: newUser.role,
          name: newUser.name,
          google_id: newUser.google_id,
          avatar_url: newUser.avatar_url,
          email_verified: newUser.email_verified,
        })
        .select()
        .single();
      if (error) {
        if (isTableMissingError(error)) throw error;
        throw error;
      }
      memoryUsers.set((data as User).id, data as User);
      return data as User;
    } catch (err: any) {
      if (isTableMissingError(err)) {
        memoryUsers.set(newUser.id, newUser);
        return newUser;
      }
      throw err;
    }
  },

  async updateById(
    id: string,
    fields: Partial<Omit<User, "id" | "created_at">>,
  ): Promise<User> {
    try {
      const { data, error } = await db()
        .from("users")
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      if (error) {
        if (isTableMissingError(error)) throw error;
        throw error;
      }
      memoryUsers.set((data as User).id, data as User);
      return data as User;
    } catch (err: any) {
      if (isTableMissingError(err)) {
        const existing = memoryUsers.get(id);
        if (!existing) throw new Error("User not found");
        const updated: User = {
          ...existing,
          ...fields,
          updated_at: new Date().toISOString(),
        };
        memoryUsers.set(id, updated);
        return updated;
      }
      throw err;
    }
  },

  async listAll(
    page = 1,
    limit = 50,
  ): Promise<{ users: PublicUser[]; total: number }> {
    try {
      const from = (page - 1) * limit;
      const to = from + limit - 1;
      const { data, error, count } = await db()
        .from("users")
        .select("id, email, role, email_verified, avatar_url, name, created_at", {
          count: "exact",
        })
        .order("created_at", { ascending: false })
        .range(from, to);
      if (error) {
        if (isTableMissingError(error)) throw error;
        throw error;
      }
      return { users: (data as PublicUser[]) ?? [], total: count ?? 0 };
    } catch (err: any) {
      if (isTableMissingError(err)) {
        const all = Array.from(memoryUsers.values()).map(toPublicUser);
        return { users: all.slice((page - 1) * limit, page * limit), total: all.length };
      }
      throw err;
    }
  },
};

// ─── RefreshTokenModel ────────────────────────────────────────────────────────

export const RefreshTokenModel = {
  async create(input: {
    user_id: string;
    token_hash: string;
    expires_at: Date;
    user_agent?: string;
    ip_address?: string;
  }): Promise<RefreshToken> {
    const record: RefreshToken = {
      id: crypto.randomUUID(),
      user_id: input.user_id,
      token_hash: input.token_hash,
      expires_at: input.expires_at.toISOString(),
      revoked: false,
      user_agent: input.user_agent ?? null,
      ip_address: input.ip_address ?? null,
      created_at: new Date().toISOString(),
    };

    try {
      const { data, error } = await db()
        .from("refresh_tokens")
        .insert({
          user_id: input.user_id,
          token_hash: input.token_hash,
          expires_at: input.expires_at.toISOString(),
          user_agent: input.user_agent ?? null,
          ip_address: input.ip_address ?? null,
          revoked: false,
        })
        .select()
        .single();
      if (error) {
        if (isTableMissingError(error)) throw error;
        throw error;
      }
      memoryRefreshTokens.push(data as RefreshToken);
      return data as RefreshToken;
    } catch (err: any) {
      if (isTableMissingError(err)) {
        memoryRefreshTokens.push(record);
        return record;
      }
      throw err;
    }
  },

  async findValidByHash(hash: string): Promise<RefreshToken | null> {
    try {
      const { data, error } = await db()
        .from("refresh_tokens")
        .select("*")
        .eq("token_hash", hash)
        .eq("revoked", false)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();
      if (error) {
        if (isTableMissingError(error)) throw error;
        throw error;
      }
      return data as RefreshToken | null;
    } catch (err: any) {
      if (isTableMissingError(err)) {
        const now = new Date();
        return (
          memoryRefreshTokens.find(
            (t) =>
              t.token_hash === hash &&
              !t.revoked &&
              new Date(t.expires_at) > now,
          ) || null
        );
      }
      throw err;
    }
  },

  async revokeByHash(hash: string): Promise<void> {
    try {
      const { error } = await db()
        .from("refresh_tokens")
        .update({ revoked: true })
        .eq("token_hash", hash);
      if (error && isTableMissingError(error)) throw error;
    } catch (err: any) {
      if (isTableMissingError(err)) {
        for (const t of memoryRefreshTokens) {
          if (t.token_hash === hash) t.revoked = true;
        }
        return;
      }
    }
  },

  async revokeAllForUser(userId: string): Promise<void> {
    try {
      const { error } = await db()
        .from("refresh_tokens")
        .update({ revoked: true })
        .eq("user_id", userId);
      if (error && isTableMissingError(error)) throw error;
    } catch (err: any) {
      if (isTableMissingError(err)) {
        for (const t of memoryRefreshTokens) {
          if (t.user_id === userId) t.revoked = true;
        }
        return;
      }
    }
  },

  async deleteExpired(): Promise<number> {
    try {
      const { count } = await db()
        .from("refresh_tokens")
        .delete({ count: "exact" })
        .lt("expires_at", new Date().toISOString());
      return count ?? 0;
    } catch (err: any) {
      if (isTableMissingError(err)) {
        const now = new Date();
        let deleted = 0;
        for (let i = memoryRefreshTokens.length - 1; i >= 0; i--) {
          if (new Date(memoryRefreshTokens[i].expires_at) < now) {
            memoryRefreshTokens.splice(i, 1);
            deleted++;
          }
        }
        return deleted;
      }
      return 0;
    }
  },
};

// ─── AuthEventModel ──────────────────────────────────────────────────────────

export const AuthEventModel = {
  async log(event: {
    user_id?: string;
    event: string;
    ip_address?: string;
    user_agent?: string;
    success: boolean;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    memoryAuthEvents.push({ ...event, created_at: new Date().toISOString() });
    try {
      await db().from("auth_events").insert({
        user_id: event.user_id ?? null,
        event: event.event,
        ip_address: event.ip_address ?? null,
        user_agent: event.user_agent ?? null,
        success: event.success,
        metadata: event.metadata ?? null,
      });
    } catch {
      // Don't throw — audit logging is non-blocking
    }
  },
};
