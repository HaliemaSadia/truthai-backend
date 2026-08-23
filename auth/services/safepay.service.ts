/**
 * auth/services/safepay.service.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Safepay Payment Gateway Service.
 * Handles Safepay order initialization, HMAC SHA256 signature verification,
 * and payment idempotency tracking.
 */

import crypto from "crypto";

// Safepay API Host URLs
const SAFEPAY_HOSTS = {
  sandbox: "https://sandbox.api.getsafepay.com",
  production: "https://api.getsafepay.com",
};

// Safepay Checkout Host URLs
const SAFEPAY_CHECKOUT_HOSTS = {
  sandbox: "https://sandbox.api.getsafepay.com/checkout/pay",
  production: "https://api.getsafepay.com/checkout/pay",
};

// In-Memory Idempotency store to track processed payment trackers
const processedTrackers = new Set<string>();

export function getSafepayEnv(): "sandbox" | "production" {
  const env = (process.env.SAFEPAY_ENVIRONMENT || "sandbox").toLowerCase().trim();
  return env === "production" ? "production" : "sandbox";
}

export function isSafepayConfigured(): boolean {
  return Boolean(
    process.env.SAFEPAY_PUBLIC_KEY &&
    process.env.SAFEPAY_SECRET_KEY &&
    process.env.SAFEPAY_PUBLIC_KEY.length > 0 &&
    process.env.SAFEPAY_SECRET_KEY.length > 0
  );
}

export interface CreateSafepaySessionInput {
  amount?: number;
  currency?: string;
  email?: string;
  orderId?: string;
  redirectUrl: string;
  cancelUrl: string;
}

export interface SafepaySessionResult {
  token: string;
  checkoutUrl: string;
}

/**
 * Initialize a Safepay order payment tracker and return the checkout URL.
 */
export async function createSafepaySession(input: CreateSafepaySessionInput): Promise<SafepaySessionResult> {
  const publicKey = process.env.SAFEPAY_PUBLIC_KEY;
  if (!publicKey) {
    throw new Error("SAFEPAY_PUBLIC_KEY is not configured on server.");
  }

  const env = getSafepayEnv();
  const apiHost = SAFEPAY_HOSTS[env];
  const checkoutHost = SAFEPAY_CHECKOUT_HOSTS[env];

  const amount = input.amount || Number(process.env.SAFEPAY_PRO_AMOUNT || 850);
  const currency = (input.currency || process.env.SAFEPAY_CURRENCY || "PKR").toUpperCase();
  const orderId = input.orderId || `order-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  // Step 1: Initialize Payment Tracker with Safepay
  const response = await fetch(`${apiHost}/order/v1/init`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client: publicKey,
      amount,
      currency,
      environment: env,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.data?.token) {
    const errorMsg = data?.message || data?.error || `Safepay tracker initialization failed (${response.status})`;
    throw new Error(errorMsg);
  }

  const token = data.data.token;

  // Step 2: Build the Safepay Checkout redirect URL
  const checkoutParams = new URLSearchParams({
    beacon: token,
    tracker: token,
    source: "custom",
    order_id: orderId,
    redirect_url: input.redirectUrl,
    cancel_url: input.cancelUrl,
  });

  const checkoutUrl = `${checkoutHost}?${checkoutParams.toString()}`;

  return {
    token,
    checkoutUrl,
  };
}

/**
 * Verify HMAC SHA256 signature from Safepay callback or webhook.
 */
export function verifySafepaySignature(payload: string | Record<string, any>, signature: string): boolean {
  const secretKey = process.env.SAFEPAY_SECRET_KEY;
  if (!secretKey || !signature) return false;

  try {
    const bodyStr = typeof payload === "string" ? payload : JSON.stringify(payload);
    const computedHmac = crypto.createHmac("sha256", secretKey).update(bodyStr).digest("hex");
    return crypto.timingSafeEqual(Buffer.from(computedHmac, "hex"), Buffer.from(signature, "hex"));
  } catch {
    // If lengths differ or hex invalid, fallback to string compare or return false
    try {
      const bodyStr = typeof payload === "string" ? payload : JSON.stringify(payload);
      const computedHmac = crypto.createHmac("sha256", secretKey).update(bodyStr).digest("hex");
      return computedHmac === signature;
    } catch {
      return false;
    }
  }
}

/**
 * Check and mark a payment tracker as processed for server-side idempotency.
 * Returns true if this is the first time processing (valid), false if already processed.
 */
export function checkAndMarkIdempotent(tracker: string): boolean {
  if (!tracker) return false;
  if (processedTrackers.has(tracker)) {
    return false; // Duplicate transaction
  }
  processedTrackers.add(tracker);
  return true;
}
