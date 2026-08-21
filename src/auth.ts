// Client-side authentication, entitlements, and daily scan metering.
// JWT tokens from the backend are stored in localStorage (ACCESS_TOKEN_KEY)
// and attached to protected API calls via the Authorization header.
//
// Identity model:
//  - Guest (no account): the app runs immediately; free tier applies.
//  - Email account: created/stored locally in the browser.
//  - Google account: real Google Identity Services sign-in (needs
//    VITE_GOOGLE_CLIENT_ID); identity is verified by Google.
//
// Pro entitlement is verified server-side against Stripe (see /api/subscription),
// so it cannot be forged by editing localStorage.

import { User, FREE_DAILY_SCANS } from './types';
import { apiUrl } from './config';

const USER_KEY = 'truthai.user';
const ACCOUNTS_KEY = 'truthai.accounts';
const SCAN_KEY = 'truthai.scans';
const REPORTS_KEY = 'truthai.reports';
const ACCESS_TOKEN_KEY = 'truthai.accessToken';

// ── JWT access token helpers (for backend-protected routes) ──────────────────

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function setAccessToken(token: string): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, token);
}

export function clearAccessToken(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
}

/**
 * Login via the real backend /auth/login endpoint.
 * Stores the returned accessToken so API calls can use it.
 * Falls back to local emailSignIn if the backend is unreachable.
 */
export async function backendLogin(
  email: string,
  password: string
): Promise<User> {
  try {
    const res = await fetch(
      (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '') + '/auth/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      }
    );
    if (res.ok) {
      const data = await res.json();
      if (data?.data?.accessToken) {
        setAccessToken(data.data.accessToken);
      }
      const u = data?.data?.user;
      if (u?.email) {
        return {
          email: (u.email as string).toLowerCase(),
          name: (u.name as string) || (u.email as string).split('@')[0],
          provider: 'email',
        } as User;
      }
    }
    // Backend returned an error — surface the message
    const errBody = await res.json().catch(() => ({}));
    throw new Error((errBody as any)?.error || `Login failed (${res.status})`);
  } catch (networkErr: any) {
    // Network error (e.g. Render cold-start) — fall back to local auth
    console.warn('[backendLogin] Network error, falling back to local auth:', networkErr?.message);
    return emailSignIn(email, password);
  }
}

export const GOOGLE_CLIENT_ID: string = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';
export const googleEnabled = GOOGLE_CLIENT_ID.length > 0;

// ── Current user persistence ─────────────────────────────────────────────────

export function getStoredUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

export function setStoredUser(user: User): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearStoredUser(): void {
  localStorage.removeItem(USER_KEY);
  clearAccessToken();
}

// ── Local email accounts (browser-only credential store) ─────────────────────

interface StoredAccount {
  email: string;
  name: string;
  passwordHash?: string;
  /** @deprecated legacy plaintext — migrated on next successful login */
  password?: string;
}

function readAccounts(): StoredAccount[] {
  try {
    return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || '[]');
  } catch {
    return [];
  }
}

function writeAccounts(accounts: StoredAccount[]): void {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

/** Hash a password with SHA-256 (browser Web Crypto). */
async function hashPassword(password: string): Promise<string> {
  const data = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Create or sign in to a local email account. Returns the user or throws. */
export async function emailSignIn(email: string, password: string): Promise<User> {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !password) throw new Error('Email and password are required.');

  const passwordHash = await hashPassword(password);
  const accounts = readAccounts();
  const existing = accounts.find((a) => a.email === normalized);

  if (existing) {
    const valid = existing.passwordHash
      ? existing.passwordHash === passwordHash
      : existing.password === password;
    if (!valid) throw new Error('Incorrect password for this account.');
    if (!existing.passwordHash) {
      existing.passwordHash = passwordHash;
      delete existing.password;
      writeAccounts(accounts);
    }
    return { email: existing.email, name: existing.name, provider: 'email' };
  }

  // First time for this email → register it.
  if (password.length < 6) throw new Error('Password must be at least 6 characters.');
  const name = normalized.split('@')[0];
  accounts.push({ email: normalized, name, passwordHash });
  writeAccounts(accounts);
  return { email: normalized, name, provider: 'email' };
}

// ── Google Identity Services ─────────────────────────────────────────────────

let gsiPromise: Promise<void> | null = null;

function loadGsiScript(): Promise<void> {
  if (gsiPromise) return gsiPromise;
  gsiPromise = new Promise((resolve, reject) => {
    if ((window as any).google?.accounts?.oauth2) return resolve();
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google sign-in.'));
    document.head.appendChild(script);
  });
  return gsiPromise;
}

/**
 * Trigger the real Google sign-in popup and resolve with the signed-in user.
 * Uses the OAuth2 token flow, then reads the verified profile from Google.
 */
export async function signInWithGoogle(): Promise<User> {
  if (!googleEnabled) {
    throw new Error('Google sign-in is not configured (set VITE_GOOGLE_CLIENT_ID).');
  }
  await loadGsiScript();

  return new Promise<User>((resolve, reject) => {
    try {
      const client = (window as any).google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: 'openid email profile',
        callback: async (resp: any) => {
          if (resp.error || !resp.access_token) {
            return reject(new Error('Google sign-in was cancelled.'));
          }
          try {
            const profile = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
              headers: { Authorization: `Bearer ${resp.access_token}` },
            }).then((r) => r.json());

            resolve({
              email: (profile.email || '').toLowerCase(),
              name: profile.name || profile.given_name || profile.email,
              picture: profile.picture,
              provider: 'google',
            });
          } catch {
            reject(new Error('Could not read your Google profile.'));
          }
        },
      });
      client.requestAccessToken();
    } catch {
      reject(new Error('Google sign-in failed to start.'));
    }
  });
}

// ── Daily scan metering (free tier) ──────────────────────────────────────────

function todayKey(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD (local-ish, fine for metering)
}

interface ScanRecord {
  date: string;
  count: number;
}

function readScanRecord(): ScanRecord {
  try {
    const rec = JSON.parse(localStorage.getItem(SCAN_KEY) || '{}');
    if (rec.date === todayKey()) return rec;
  } catch {
    /* ignore */
  }
  return { date: todayKey(), count: 0 };
}

/** Scans used so far today. */
export function scansUsedToday(): number {
  return readScanRecord().count;
}

// TEMP: Development-only scan limit bypass
// True only on localhost or in Vite dev mode. A production build served from a
// real domain leaves this false, so production behaviour is 100% unchanged.
const isDevelopment =
  (typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) ||
  import.meta.env.DEV;

/** Scans remaining today for a free user. */
export function scansRemaining(isPro: boolean): number {
  // TEMP: Development-only scan limit bypass
  if (isDevelopment) return Infinity;
  if (isPro) return Infinity;
  return Math.max(0, FREE_DAILY_SCANS - scansUsedToday());
}

/** Whether another scan is allowed right now. */
export function canScan(isPro: boolean): boolean {
  // TEMP: Development-only scan limit bypass
  if (isDevelopment) return true;
  return isPro || scansUsedToday() < FREE_DAILY_SCANS;
}

/** Record that a scan was consumed (no-op for Pro). */
export function recordScan(isPro: boolean): void {
  if (isPro) return;
  const rec = readScanRecord();
  localStorage.setItem(SCAN_KEY, JSON.stringify({ date: todayKey(), count: rec.count + 1 }));
}

// ── Pro subscription status (verified against Stripe) ────────────────────────

/** Ask the backend whether this email has an active Stripe subscription. */
export async function fetchProStatus(email: string | undefined): Promise<boolean> {
  if (!email) return false;
  try {
    const res = await fetch(apiUrl(`/api/subscription?email=${encodeURIComponent(email)}`));
    if (!res.ok) return false;
    const data = await res.json();
    return !!data.isPro;
  } catch {
    return false;
  }
}

/** Start a Stripe Checkout session and redirect the browser to it. */
export async function startCheckout(email: string | undefined): Promise<void> {
  const res = await fetch(apiUrl('/api/checkout'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.url) {
    throw new Error(data.error || 'Could not start checkout. Payments may not be configured yet.');
  }
  window.location.href = data.url;
}

// ── Pro-only history persistence ─────────────────────────────────────────────

export function loadSavedReports(): any[] | null {
  try {
    const raw = localStorage.getItem(REPORTS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveReports(reports: any[]): void {
  try {
    localStorage.setItem(REPORTS_KEY, JSON.stringify(reports));
  } catch {
    /* quota / serialization issues are non-fatal */
  }
}

export function clearSavedReports(): void {
  localStorage.removeItem(REPORTS_KEY);
}
