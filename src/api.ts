/** Shared API helpers with consistent error extraction. */

import { getAccessToken } from './auth';

export class ApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public body?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Parse JSON from a fetch Response; fall back to an empty object. */
async function readJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Human-readable message from an API error payload. */
export function messageFromPayload(data: Record<string, unknown>, fallback: string): string {
  if (typeof data.message === 'string' && data.message.trim()) return data.message;
  if (typeof data.error === 'string' && data.error.trim()) return data.error;
  if (typeof data.explanation === 'string' && data.explanation.trim()) return data.explanation;
  return fallback;
}

/** Build Authorization headers if a JWT token is available. */
function authHeaders(): Record<string, string> {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** POST JSON to an API route and throw ApiError on failure. */
export async function postJson<T extends Record<string, unknown>>(
  url: string,
  body: unknown
): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  const data = await readJson(res);

  if (!res.ok) {
    throw new ApiError(
      messageFromPayload(data, `Request failed (${res.status})`),
      res.status,
      data
    );
  }

  return data as T;
}

/** GET JSON from an API route and throw ApiError on failure. */
export async function getJson<T extends Record<string, unknown>>(url: string): Promise<T> {
  const res = await fetch(url, {
    method: 'GET',
    headers: { ...authHeaders() },
    credentials: 'include',
  });
  const data = await readJson(res);

  if (!res.ok) {
    throw new ApiError(
      messageFromPayload(data, `GET failed (${res.status})`),
      res.status,
      data
    );
  }

  return data as T;
}

/** DELETE an API resource and throw ApiError on failure. */
export async function deleteJson<T extends Record<string, unknown>>(url: string): Promise<T> {
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { ...authHeaders() },
    credentials: 'include',
  });
  const data = await readJson(res);

  if (!res.ok) {
    throw new ApiError(
      messageFromPayload(data, `DELETE failed (${res.status})`),
      res.status,
      data
    );
  }

  return data as T;
}

/** POST JSON; on HTTP error still return the body when it looks like a forensic fallback report. */
export async function postAnalyze<T extends Record<string, unknown>>(
  url: string,
  body: unknown
): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  const data = await readJson(res);

  if (!res.ok && !data.error_safe_fallback && !data.truthScore) {
    throw new ApiError(
      messageFromPayload(data, `Analysis failed (${res.status})`),
      res.status,
      data
    );
  }

  return data as T;
}
