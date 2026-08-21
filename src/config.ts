// API base URL for the TruthAI backend.
//
// - Local dev / same-origin deploy (frontend served by Express): leave unset → '' (relative /api/... calls).
// - Static hosting (cPanel/FTP) with the backend deployed separately (Render/Railway/VPS):
//     set VITE_API_BASE_URL to the backend's absolute URL at BUILD time, e.g.
//     VITE_API_BASE_URL=https://truthai-api.onrender.com
//
// Vite inlines import.meta.env.VITE_* at build time, so this must be set before `npm run build`.
export const API_BASE: string = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

/** Build a full API URL, respecting the configured base. */
export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}
