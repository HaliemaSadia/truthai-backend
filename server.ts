import express from "express";
import path from "path";
import OpenAI from "openai";
import Stripe from "stripe";
import dotenv from "dotenv";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import passport from "passport";
import {
  analyzeHandwritingForensics,
  analyzeImageForensics,
  type ForensicReport,
  type HandwritingReport,
} from "./forensics";
import https from "https";
import http from "http";
import sharp from "sharp";

import authRoutes from "./auth/routes/auth.routes.js";
import { configurePassport } from "./auth/config/passport.js";
import { authenticate, authenticateOptional } from "./auth/middleware/authenticate.js";

dotenv.config();
configurePassport();

/** Resize and compress an image buffer to avoid timeouts and payload size limits on OpenAI Vision API. */
async function resizeImageForVision(buffer: Buffer): Promise<string> {
  const resized = await sharp(buffer)
    .resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
  return `data:image/jpeg;base64,${resized.toString("base64")}`;
}


// ── Process-level safety net ──────────────────────────────────────────────────
// A throw/rejection escaping a handler would kill the Node process and make the
// browser see "Failed to fetch" on every in-flight request. Log and stay alive.
process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err);
});

let openaiClient: OpenAI | null = null;
function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY environment variable is required in secrets/env");
    }
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

let stripeClient: Stripe | null = null;
function getStripeClient(): Stripe {
  if (!stripeClient) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY environment variable is required for payments");
    stripeClient = new Stripe(key);
  }
  return stripeClient;
}

/** True when Stripe is fully configured for subscription checkout. */
function stripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY && !!process.env.STRIPE_PRICE_ID;
}

/** Absolute origin of the deployed app, for Stripe redirect URLs. */
function publicBaseUrl(req: express.Request): string {
  const base =
    process.env.PUBLIC_BASE_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    `${req.protocol}://${req.get("host")}`;
  return base.replace(/\/$/, "");
}

// ─────────────────────────────────────────────────────────────────────────────
// Platform Detection
// ─────────────────────────────────────────────────────────────────────────────

type SocialPlatform =
  | "youtube"
  | "facebook"
  | "instagram"
  | "tiktok"
  | "twitter"
  | "vimeo"
  | "reddit"
  | "linkedin"
  | "snapchat"
  | "pinterest"
  | "generic";

function detectPlatform(url: string): SocialPlatform {
  const u = url.toLowerCase();
  if (/(?:youtube\.com|youtu\.be)/.test(u)) return "youtube";
  if (/facebook\.com|fb\.com|fb\.watch/.test(u)) return "facebook";
  if (/instagram\.com/.test(u)) return "instagram";
  if (/tiktok\.com/.test(u)) return "tiktok";
  if (/(?:twitter\.com|x\.com)/.test(u)) return "twitter";
  if (/vimeo\.com/.test(u)) return "vimeo";
  if (/reddit\.com/.test(u)) return "reddit";
  if (/linkedin\.com/.test(u)) return "linkedin";
  if (/snapchat\.com/.test(u)) return "snapchat";
  if (/pinterest\.com/.test(u)) return "pinterest";
  return "generic";
}

function isUrl(text: string): boolean {
  return /^https?:\/\//i.test(text.trim());
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP Helpers
// ─────────────────────────────────────────────────────────────────────────────

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/** Block SSRF to private networks, metadata endpoints, and non-http(s) schemes. */
function isSafePublicUrl(raw: string, redirectDepth = 0): boolean {
  if (redirectDepth > 5) return false;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }
  if (!["http:", "https:"].includes(parsed.protocol)) return false;

  const host = parsed.hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
  if (
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "metadata.google.internal" ||
    host === "169.254.169.254"
  ) {
    return false;
  }

  // IPv4 private / link-local / loopback ranges
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const octets = ipv4.slice(1).map(Number);
    if (octets.some((o) => o > 255)) return false;
    const [a, b] = octets;
    if (a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254)) {
      return false;
    }
  }

  // IPv6 loopback / link-local / unique-local
  if (host.includes(":")) {
    const h = host;
    if (h === "::1" || h.startsWith("fe80:") || h.startsWith("fc") || h.startsWith("fd")) return false;
  }

  return true;
}

/** Fetch raw bytes from a URL, following redirects (public http(s) only). */
function fetchBuffer(url: string, extraHeaders: Record<string, string> = {}, redirectDepth = 0): Promise<Buffer> {
  if (!isSafePublicUrl(url, redirectDepth)) {
    return Promise.reject(new Error("URL is not allowed for fetching"));
  }

  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    const req = lib.get(
      url,
      { headers: { "User-Agent": BROWSER_UA, ...extraHeaders }, timeout: 10000 },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const next = new URL(res.headers.location, url).href;
          return fetchBuffer(next, extraHeaders, redirectDepth + 1).then(resolve).catch(reject);
        }
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks)));
        res.on("error", reject);
      }
    );
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Request timed out")); });
  });
}

/** Fetch page HTML as string */
async function fetchHtml(url: string): Promise<string> {
  const buf = await fetchBuffer(url, { Accept: "text/html" });
  return buf.toString("utf-8");
}

/** Fetch JSON from a URL */
async function fetchJson(url: string): Promise<any> {
  const buf = await fetchBuffer(url, { Accept: "application/json" });
  return JSON.parse(buf.toString("utf-8"));
}

/** Convert image buffer to inline base64 data URL */
function bufferToBase64(buf: Buffer, mime = "image/jpeg"): string {
  return `data:${mime};base64,${buf.toString("base64")}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Open Graph / Metadata Extraction (universal fallback for all platforms)
// ─────────────────────────────────────────────────────────────────────────────

interface PageMeta {
  title: string;
  description: string;
  imageUrl: string;
  siteName: string;
  videoType: string;
}

/** Extract Open Graph + Twitter card meta tags from raw HTML */
function extractOpenGraph(html: string): PageMeta {
  const getMeta = (prop: string): string => {
    const patterns = [
      new RegExp(`<meta[^>]+property=["']og:${prop}["'][^>]+content=["']([^"']+)["']`, "i"),
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:${prop}["']`, "i"),
      new RegExp(`<meta[^>]+name=["']twitter:${prop}["'][^>]+content=["']([^"']+)["']`, "i"),
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:${prop}["']`, "i"),
    ];
    for (const p of patterns) {
      const m = html.match(p);
      if (m) return m[1].trim();
    }
    return "";
  };

  // Also try plain <title> tag as fallback
  const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i);

  return {
    title: getMeta("title") || (titleTag ? titleTag[1].trim() : ""),
    description: getMeta("description"),
    imageUrl: getMeta("image"),
    siteName: getMeta("site_name"),
    videoType: getMeta("video:type") || getMeta("type"),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Platform-Specific Metadata Fetchers
// ─────────────────────────────────────────────────────────────────────────────

interface MediaContext {
  platform: SocialPlatform;
  title: string;
  author: string;
  description: string;
  thumbnailBase64: string; // empty string if unavailable
  thumbnailMime: string;
}

/** Try to fetch an image from a URL and return base64, or "" on failure */
async function tryFetchImageBase64(url: string): Promise<{ b64: string; mime: string }> {
  try {
    if (!url) return { b64: "", mime: "image/jpeg" };
    const buf = await fetchBuffer(url);
    if (buf.length < 4000) return { b64: "", mime: "image/jpeg" }; // placeholder / too small
    const mime = url.includes(".png") ? "image/png" : url.includes(".webp") ? "image/webp" : "image/jpeg";
    return { b64: bufferToBase64(buf, mime), mime };
  } catch {
    return { b64: "", mime: "image/jpeg" };
  }
}

/** YouTube: use oEmbed + direct thumbnail CDN */
async function fetchYouTubeContext(url: string): Promise<MediaContext> {
  const vidId = url.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/
  )?.[1];

  let title = "YouTube Video";
  let author = "Unknown Channel";
  let thumbUrl = vidId ? `https://img.youtube.com/vi/${vidId}/hqdefault.jpg` : "";

  if (vidId) {
    try {
      const oEmbed = await fetchJson(
        `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${vidId}&format=json`
      );
      title = oEmbed.title || title;
      author = oEmbed.author_name || author;
      thumbUrl = oEmbed.thumbnail_url || `https://img.youtube.com/vi/${vidId}/maxresdefault.jpg`;
    } catch { /* use defaults */ }
  }

  const img = await tryFetchImageBase64(thumbUrl);
  return { platform: "youtube", title, author, description: "", thumbnailBase64: img.b64, thumbnailMime: img.mime };
}

/** TikTok: public oEmbed API gives thumbnail_url */
async function fetchTikTokContext(url: string): Promise<MediaContext> {
  let title = "TikTok Video";
  let author = "Unknown Creator";
  let thumbUrl = "";

  try {
    const oEmbed = await fetchJson(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`);
    title = oEmbed.title || title;
    author = oEmbed.author_name || author;
    thumbUrl = oEmbed.thumbnail_url || "";
  } catch { /* fall through to OG */ }

  let img = await tryFetchImageBase64(thumbUrl);

  // If oEmbed thumbnail failed, try Open Graph
  if (!img.b64) {
    try {
      const html = await fetchHtml(url);
      const og = extractOpenGraph(html);
      title = og.title || title;
      if (og.imageUrl) img = await tryFetchImageBase64(og.imageUrl);
    } catch { /* ignore */ }
  }

  return { platform: "tiktok", title, author, description: "", thumbnailBase64: img.b64, thumbnailMime: img.mime };
}

/** Vimeo: public oEmbed API */
async function fetchVimeoContext(url: string): Promise<MediaContext> {
  let title = "Vimeo Video";
  let author = "Unknown Creator";
  let thumbUrl = "";

  try {
    const oEmbed = await fetchJson(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`);
    title = oEmbed.title || title;
    author = oEmbed.author_name || author;
    thumbUrl = oEmbed.thumbnail_url || "";
  } catch { /* fall through */ }

  const img = await tryFetchImageBase64(thumbUrl);
  return { platform: "vimeo", title, author, description: "", thumbnailBase64: img.b64, thumbnailMime: img.mime };
}

/** Generic / Facebook / Instagram / Twitter / Reddit / LinkedIn:
 *  Fetch page HTML and extract Open Graph image */
async function fetchGenericContext(url: string, platform: SocialPlatform): Promise<MediaContext> {
  let title = `${platform.charAt(0).toUpperCase() + platform.slice(1)} Content`;
  let description = "";
  let author = "";
  let img = { b64: "", mime: "image/jpeg" };

  try {
    const html = await fetchHtml(url);
    const og = extractOpenGraph(html);
    title = og.title || title;
    description = og.description || "";

    if (og.imageUrl) {
      img = await tryFetchImageBase64(og.imageUrl);
    }
  } catch (e) {
    console.warn(`[${platform}] HTML fetch failed:`, (e as Error).message);
  }

  return { platform, title, author, description, thumbnailBase64: img.b64, thumbnailMime: img.mime };
}

/** Master dispatcher — picks the right fetcher for each platform */
async function fetchMediaContext(url: string): Promise<MediaContext> {
  const platform = detectPlatform(url);

  switch (platform) {
    case "youtube":   return fetchYouTubeContext(url);
    case "tiktok":    return fetchTikTokContext(url);
    case "vimeo":     return fetchVimeoContext(url);
    default:          return fetchGenericContext(url, platform);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Platform display names & content type hints
// ─────────────────────────────────────────────────────────────────────────────

const PLATFORM_LABELS: Record<SocialPlatform, string> = {
  youtube:   "YouTube",
  facebook:  "Facebook",
  instagram: "Instagram",
  tiktok:    "TikTok",
  twitter:   "Twitter / X",
  vimeo:     "Vimeo",
  reddit:    "Reddit",
  linkedin:  "LinkedIn",
  snapchat:  "Snapchat",
  pinterest: "Pinterest",
  generic:   "Web",
};

// ─────────────────────────────────────────────────────────────────────────────
// System Prompt
// ─────────────────────────────────────────────────────────────────────────────

// Text analysis — linguistic authenticity (different domain, different schema).
const TEXT_PROMPT = `You are a digital media forensic analyst assessing whether TEXT is AI-generated.
Reason from evidence: low perplexity/burstiness (uniform sentence rhythm, generic hedge-y phrasing, absence of specific lived detail, over-structured lists) suggests AI; vivid specificity, idiosyncrasy, and natural irregularity suggest human. Never claim certainty from style alone; if evidence is weak, stay uncertain.

Think first in "reasoning". Output ONLY this JSON:
{
  "reasoning": string,
  "title": string,
  "truthScore": number (0-100 authenticity; 35-65 when unsure),
  "confidence": number (0-100),
  "status": "authentic" | "ai-generated" | "uncertain",
  "riskLevel": "low" | "moderate" | "high",
  "explanation": string,
  "metrics": [
    { "name": "Linguistic Perplexity", "score": number, "label": "LOW"|"MODERATE"|"HIGH"|"CRITICAL", "description": string },
    { "name": "Cadence & Burstiness", "score": number, "label": "LOW"|"MODERATE"|"HIGH"|"CRITICAL", "description": string },
    { "name": "Specificity & Voice", "score": number, "label": "LOW"|"MODERATE"|"HIGH"|"CRITICAL", "description": string }
  ],
  "resolution": "Text analysis", "colorSpace": "N/A", "bitDepth": "Linguistic analysis",
  "method": "Linguistic forensic analysis"
}`;

// ─────────────────────────────────────────────────────────────────────────────
// Forensic ↔ vision fusion
// ─────────────────────────────────────────────────────────────────────────────

/** Decode possible data-URL or raw base64 into a Buffer (or null). */
function base64ToBuffer(input: string): Buffer | null {
  try {
    const b64 = input.includes(",") ? input.split(",")[1] : input;
    return Buffer.from(b64, "base64");
  } catch {
    return null;
  }
}

/** Map a 0–100 suspicion to the UI metric label. */
function labelFor(score: number): "LOW" | "MODERATE" | "HIGH" | "CRITICAL" {
  if (score >= 80) return "CRITICAL";
  if (score >= 55) return "HIGH";
  if (score >= 30) return "MODERATE";
  return "LOW";
}

function score0To100(value: any, fallback = 50): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n <= 1 ? n * 100 : n)));
}

// OpenAI's ONLY job for images: explain the measured evidence. It does not see
// the image and must not invent or alter any score or finding.
const EXPLAIN_PROMPT = `You are a forensic report writer. An automated pixel-forensics pipeline has ALREADY analysed the image and produced the scores and evidence you are given. You did NOT run any analysis and you CANNOT see the image.

Rules:
- Do NOT create, change, or invent any scores, numbers, percentages, or findings.
- Do NOT claim to have visually observed anything.
- Only explain, in plain language, what the PROVIDED measurements and evidence indicate about whether the image is AI-generated.
- If the evidence is weak or mixed, say so plainly. Do not overstate.

Output ONLY JSON: { "title": "<short neutral title>", "explanation": "<2-4 sentence plain-English explanation grounded strictly in the provided measurements>" }`;

// Vision classifier — GPT-4o looks at the image and classifies it (the authoritative
// verdict for images; pixel-forensics is supplementary).
const VISION_CLASSIFY_PROMPT = `You are DeepFakeJudge, a recall-leaning forensic detector for modern AI-generated faces, portraits, and documents (StyleGAN, Stable Diffusion, Midjourney, Flux, AI handwriting generators). Many inputs are photorealistic AI faces or fake handwritten documents engineered to look real. Photorealism/authenticity is NOT proof of reality — lean toward catching fakes, but do not flag plainly mundane real photos/documents.

Score two values (0-100):
- camera_realism_score: evidence of genuine real-camera capture
- synthetic_score: how AI-generated it looks. Give PARTIAL CREDIT for subtle/soft tells — modern fakes rarely show obvious artifacts.

SYNTHETIC tells (you do NOT need hard artifacts):
- skin too smooth / waxy / airbrushed, or plastic over-uniform micro-texture
- painterly or patch-like background blur; melted, vague, or incoherent background objects
- hair dissolving into a soft haze at the edges instead of crisp strands
- subtly asymmetric or mismatched eyes / ears / glasses; irises too perfect or slightly off
- teeth that blend together or lack crisp separation
- studio-perfect harmonious lighting/color on a casual snapshot
- artificially clean dark/shadow regions; the uncanny over-perfection
- (HANDWRITING/TEXT) identical letter glyph shapes (e.g., every 'a' or 'e' is perfectly congruent throughout the page), indicating font-based replication or generative replication rather than natural human micro-variations.
- (HANDWRITING/TEXT) unnaturally perfect alignment, uniform margins, straight lines with zero natural baseline drifting or pen pressure variations.

REAL-camera tells: visible pores / real skin texture, sensor grain, optical depth-of-field, crisp hair with flyaways, mundane asymmetry, ordinary/cluttered framing. For documents: natural handwritten imperfections, minor variations in letter shape/tilt, pencil/ink pressure variations, and realistic paper texture.

CLASSIFY:
- AI_GENERATED  — generated-portrait feel, two or more soft synthetic tells, or clear AI-generated/font-replicated handwriting tells (e.g., congruent/symmetrical letter shapes).
- REAL_CAMERA    — concrete real-camera tells present and synthetic tells absent or explainable by compression/low-res
- MANIPULATED    — real base photo/document with localized edited/spliced/synthesized regions
- UNCERTAIN      — non-portrait/non-text scene with no signal, or a genuine tie
When an input leans synthetic, prefer AI_GENERATED over UNCERTAIN. Do NOT invent tells you cannot see; do NOT flag a plain real photo/document just for being high quality.

Output ONLY JSON:
{
"camera_realism_score":0,
"synthetic_score":0,
"classification":"REAL_CAMERA | AI_GENERATED | MANIPULATED | UNCERTAIN",
"confidence":0,
"evidence":["","",""],
"reasoning":""
}`;

const HANDWRITING_CLASSIFY_PROMPT = `You are a forensic document examiner specializing in AI-generated handwritten assignments.

Your ONLY task is to determine whether the handwriting was produced by a real human or generated synthetically (AI, font rendering, handwriting generator, diffusion model, GAN, VLM, or digital simulation).

DO NOT assume neat handwriting means authentic.

You are NOT deciding whether the page is a real photo; a fake handwritten assignment can be printed or photographed on real paper and still be fake. Do not call handwriting genuine merely because paper texture, lighting, shadows, camera blur, or background look real.

Perform a detailed forensic analysis using the following signals.

==========================
1. LETTER CONSISTENCY
==========================

Look for repeated letter templates.

Humans never reproduce identical versions of:
- a, e, s, r, t, h, g, y, n, o

Measure: identical curves, identical heights, repeated stroke angles, repeated loops.
High repetition strongly indicates synthetic handwriting.

==========================
2. NATURAL VARIATION
==========================

Real handwriting contains: varying pressure, varying pen speed, inconsistent slant, changing baseline, changing letter width, occasional hesitation, imperfect spacing.
If writing is uniformly perfect across the page, increase AI probability.

==========================
3. STROKE ANALYSIS
==========================

Look for: constant stroke width, absence of pressure changes, perfect curves, mathematically smooth lines, vector-like edges, no pen hesitation, no hook artifacts, no start/end pressure marks.
Real handwriting contains acceleration and deceleration.

==========================
4. BASELINE ANALYSIS
==========================

Humans drift. Check if text perfectly follows notebook lines, maintains identical height, or has no upward/downward drift. Perfect alignment is suspicious.

==========================
5. SPACING ANALYSIS
==========================

Measure consistency of word spacing, letter spacing, line spacing, and margins. Human spacing changes naturally. Near-identical spacing throughout the page increases AI probability.

==========================
6. CHARACTER SHAPE VARIATION
==========================

Compare repeated words (e.g., "the" written multiple times). A human writes them differently every time. Synthetic systems often reuse identical glyphs. Measure similarity.

==========================
7. WRITING RHYTHM
==========================

Estimate writing flow. Humans naturally speed up and slow down. AI handwriting often has identical rhythm everywhere.

==========================
8. PEN PRESSURE
==========================

Estimate dark/light transitions, pressure changes, and beginning/end stroke pressure. Constant darkness is suspicious.

==========================
9. GENERATOR ARTIFACTS
==========================

Search for: repeated micro patterns, cloned letters, repeated connections, overly smooth joins, texture inconsistencies, rendering artifacts, diffusion artifacts, interpolation artifacts.

==========================
10. PAGE-LEVEL CONSISTENCY
==========================

Check whether every line appears to have been written with identical speed, pressure, slant, size, and spacing. Humans become tired; writing naturally changes over time. Synthetic writing usually does not.

==========================
11. IMAGE QUALITY CHECK
==========================

Before declaring "Original Handwritten", verify the image quality is sufficient. If the image is blurry, low resolution, compressed, partially cropped, or heavily edited, reduce confidence and mention uncertainty.

==========================
12. HUMAN POSITIVE EVIDENCE
==========================

Do NOT only search for AI artifacts.

Actively search for evidence that supports genuine human handwriting.

Increase the Human Score whenever you observe:

• Natural variation in repeated letters.
• Uneven character sizes.
• Slight baseline drift.
• Variable word spacing.
• Variable letter spacing.
• Different pen pressure throughout the page.
• Natural pen hesitation.
• Small corrections or overwriting.
• Minor spelling mistakes.
• Irregular line endings.
• Uneven margins.
• Gradual writing fatigue.
• Local inconsistencies caused by natural wrist movement.
• Small changes in slant between lines.
• Different writing speed in different words.
• Natural notebook distortion.
• Ink accumulation at stroke starts and ends.

Each independently observed human characteristic should increase confidence that the document is authentic.

Do NOT ignore positive evidence simply because the handwriting is neat.

==========================
13. FORENSIC SCORING
==========================

Start with:

Human Score = 50
Synthetic Score = 50

For every independent human indicator: +4 Human Score
For every strong human indicator: +8 Human Score
For every weak AI indicator: +3 Synthetic Score
For every strong AI indicator: +8 Synthetic Score

Maximum score = 100.

Final classification is determined only by comparing Human Score and Synthetic Score.

Difference >20: Choose higher score.
Difference 10–20: Lower confidence.
Difference <10: Return Uncertain.

==========================
14. BALANCED DECISION LOGIC
==========================

Classification must be evidence-driven.

Never classify a document as AI-generated solely because it is neat.

Never classify a document as Uncertain unless BOTH conditions hold:
1. Strong AI indicators are present.
AND
2. Strong human indicators are absent or contradictory.

If multiple independent human characteristics are visible and no major synthetic artifacts exist, classify the document as:

Original Handwritten

with confidence above 80%.

If both human and AI evidence coexist with similar strength:

Classification: Uncertain
Confidence: 50–75%

If synthetic evidence clearly outweighs human evidence:

Classification: Likely AI-Generated Handwriting
Confidence: 80–99%

IMPORTANT:

Human handwriting naturally contains many characteristics that AI generators intentionally imitate.

Therefore, the absence of AI artifacts is itself evidence supporting authenticity.

Never require finding obvious defects before declaring a document Original.

The model must search equally for:
(1) evidence of synthesis
and
(2) evidence of genuine human writing.

Treat both categories with equal importance.

Base the verdict only on observable forensic handwriting characteristics.

Return ONLY valid JSON:
{
  "classification": "Original Handwritten" | "Likely AI-Generated Handwriting" | "Uncertain",
  "confidence": 0,
  "risk_level": "Low" | "Medium" | "High",
  "human_score": 0,
  "synthetic_score": 0,
  "human_evidence": ["", "", ""],
  "evidence": ["", "", "", ""],
  "suspicious_features": ["", "", ""],
  "reasoning": "A concise forensic explanation based only on observable handwriting evidence.",
  "recommendation": "If confidence is below 70, recommend manual review."
}`;

/** GPT-4o vision classification of the image using VISION_CLASSIFY_PROMPT. */
async function classifyImageWithVision(openai: OpenAI, dataUrl: string): Promise<any | null> {
  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4o",
    messages: [
      { role: "system", content: VISION_CLASSIFY_PROMPT },
      { role: "user", content: [
        { type: "text", text: "Analyze the attached image and return ONLY the JSON." },
        { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
      ] },
    ],
    response_format: { type: "json_object" },
    temperature: 0.1,
    max_tokens: 700,
  });
  try { return JSON.parse(response.choices[0].message.content || "{}"); }
  catch { return null; }
}

async function classifyHandwritingWithVision(openai: OpenAI, dataUrl: string): Promise<any | null> {
  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4o",
    messages: [
      { role: "system", content: HANDWRITING_CLASSIFY_PROMPT },
      { role: "user", content: [
        { type: "text", text: "Perform a full forensic handwriting examination on this assignment page. Analyze only the handwriting morphology — not paper texture or photo realism. Return ONLY the JSON." },
        { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
      ] },
    ],
    response_format: { type: "json_object" },
    temperature: 0.05,
    max_tokens: 900,
  });
  try { return JSON.parse(response.choices[0].message.content || "{}"); }
  catch { return null; }
}

/** Map the vision classifier's JSON → the report shape (forensics optional, supplementary). */
function handwritingMetrics(handwriting: HandwritingReport | null) {
  if (!handwriting?.applicable) return [];
  return handwriting.signals.slice(0, 6).map((s) => ({
    name: s.name,
    score: Math.max(0, Math.min(100, Math.round(s.score))),
    label: labelFor(s.score),
    description: s.detail,
  }));
}

function normalizeHandwritingVision(raw: any | null) {
  if (!raw) return null;
  const cls = String(raw.classification || "").trim();
  const clsUpper = cls.toUpperCase();
  const hvHuman = score0To100(raw.human_score ?? raw.human_variation_score, NaN);
  const hvGenerated = score0To100(raw.synthetic_score ?? raw.generated_handwriting_score, NaN);
  const hvConfidence = score0To100(raw.confidence, 0);
  const scoreDiff = Number.isFinite(hvHuman) && Number.isFinite(hvGenerated) ? hvHuman - hvGenerated : NaN;
  const strongHumanEvidence = Number.isFinite(hvHuman) && hvHuman >= 68;
  const strongSyntheticEvidence = Number.isFinite(hvGenerated) && hvGenerated >= 68;
  const balancedUncertain = /UNCERTAIN/.test(clsUpper) ||
    (Number.isFinite(scoreDiff) && Math.abs(scoreDiff) < 10);
  const isSynthetic =
    /AI[- ]GENERATED|LIKELY AI[- ]GENERATED/.test(clsUpper) ||
    (Number.isFinite(scoreDiff) && scoreDiff <= -20 && strongSyntheticEvidence && !strongHumanEvidence);
  const isGenuine =
    (/ORIGINAL HANDWRITTEN|^ORIGINAL$/.test(clsUpper) && !/AI|GENERATED|SYNTHETIC/.test(clsUpper)) ||
    (Number.isFinite(scoreDiff) && scoreDiff >= 20 && strongHumanEvidence && !strongSyntheticEvidence);
  const isUncertain = balancedUncertain ||
    (Number.isFinite(scoreDiff) && Math.abs(scoreDiff) >= 10 && Math.abs(scoreDiff) <= 20 && !isGenuine && !isSynthetic);
  const evidence = Array.isArray(raw.evidence) ? raw.evidence.map(String).filter(Boolean) : [];
  const humanEvidence = Array.isArray(raw.human_evidence) ? raw.human_evidence.map(String).filter(Boolean) : [];
  const suspicious = Array.isArray(raw.suspicious_features) ? raw.suspicious_features.map(String).filter(Boolean) : [];
  const reasoning = String(raw.reasoning || "").trim();
  const recommendation = String(raw.recommendation || "").trim();
  const riskLevel = String(raw.risk_level || "").trim();
  return {
    raw,
    classification: cls,
    hvHuman,
    hvGenerated,
    hvConfidence,
    scoreDiff,
    strongHumanEvidence,
    strongSyntheticEvidence,
    isSynthetic,
    isGenuine,
    isUncertain,
    evidence,
    humanEvidence,
    suspicious,
    reasoning,
    recommendation,
    riskLevel,
  };
}

function applyHandwritingVerdict(report: any, handwriting: HandwritingReport | null, handwritingVision: any | null = null): any {
  if (!handwriting?.applicable) return report;

  const hwMetrics = handwritingMetrics(handwriting);
  const hv = normalizeHandwritingVision(handwritingVision);
  const hvClass = hv?.classification || "";
  const hvGenerated = hv?.hvGenerated ?? NaN;
  const hvHuman = hv?.hvHuman ?? NaN;
  const hvConfidence = hv?.hvConfidence ?? 0;
  if (Number.isFinite(hvGenerated)) {
    hwMetrics.unshift({
      name: "Forensic Handwriting Examiner",
      score: hvGenerated,
      label: labelFor(hvGenerated),
      description: `Forensic read: ${hvClass || "UNKNOWN"}; human characteristics ${Number.isFinite(hvHuman) ? hvHuman : "?"}/100.`,
    });
  }
  report.metrics = [...hwMetrics, ...(Array.isArray(report.metrics) ? report.metrics : [])];
  report.handwriting = handwriting;
  if (handwritingVision) report.handwritingVision = handwritingVision;

  const genericSynthetic = report.status === "ai-generated" || report.status === "manipulated"
    ? Math.max(58, 100 - (Number(report.truthScore) || 50))
    : Math.max(0, Math.min(100, 100 - (Number(report.truthScore) || 50)));
  const visionAvailable = Number.isFinite(hvGenerated) && Number.isFinite(hvHuman);
  const ensembleSynthetic = Math.round(
    handwriting.syntheticProbability * (visionAvailable ? 0.30 : 0.85) +
    (visionAvailable ? hvGenerated * 0.45 : 0) +
    genericSynthetic * (visionAvailable ? 0.05 : 0.15) +
    (visionAvailable && hv?.strongHumanEvidence ? -Math.min(15, Math.max(0, (hv.hvHuman - hv.hvGenerated) * 0.2)) : 0)
  );
  const strongMorphology = handwriting.signals.filter((s) => s.score >= 58).length;
  const visionSaysGenerated = hv?.isSynthetic || (Number.isFinite(hvGenerated) && hvGenerated >= 72 && !hv?.strongHumanEvidence);
  const visionSaysGenuine = hv?.isGenuine || (Number.isFinite(hvHuman) && hvHuman >= 68 && (Number.isFinite(hvGenerated) ? hvHuman - hvGenerated >= 15 : true));
  const visionSaysUncertain = hv?.isUncertain || false;
  const forensicNotes = [
    hv?.reasoning,
    ...(hv?.humanEvidence?.slice(0, 2) || []),
    ...(hv?.suspicious?.slice(0, 2) || []),
    ...(hv?.evidence?.slice(0, 2) || []),
  ].filter(Boolean).join(" ");
  const hwSummary =
    `Handwriting forensics: ${handwriting.verdict} (morphology synthetic ${handwriting.syntheticProbability}/100, ensemble ${ensembleSynthetic}/100, human ${Number.isFinite(hvHuman) ? hvHuman : "?"}/100, confidence ${Math.max(handwriting.confidence, hvConfidence)}/100).`;
  report.method = `${report.method || "Image classification"} + forensic handwriting examination`;
  report.bitDepth = `${report.bitDepth || "Image forensics"} · forensic handwriting morphology`;

  // Strong synthetic evidence overrides; strong human evidence protects genuine pages.
  if (
    !visionSaysGenuine &&
    (
      handwriting.verdict === "likely-ai" ||
      visionSaysGenerated ||
      (ensembleSynthetic >= 62 && strongMorphology >= 2 && hv?.strongSyntheticEvidence && !hv?.strongHumanEvidence)
    )
  ) {
    const truthScore = Math.max(5, Math.min(42, 100 - ensembleSynthetic));
    const riskFromForensics = /HIGH/i.test(hv?.riskLevel || "") ? "high" : /MEDIUM/i.test(hv?.riskLevel || "") ? "moderate" : truthScore < 40 ? "high" : "moderate";
    return {
      ...report,
      title: "Handwritten Assignment — Likely AI-Generated",
      truthScore,
      confidence: Math.max(Number(report.confidence) || 0, handwriting.confidence, hvConfidence),
      status: "ai-generated",
      riskLevel: riskFromForensics,
      explanation: `${hwSummary} ${forensicNotes || handwriting.evidence.slice(0, 2).join(" ")}`.slice(0, 480),
    };
  }

  if (
    report.status === "authentic" &&
    !visionSaysGenuine &&
    (
      visionSaysUncertain ||
      (ensembleSynthetic >= 55 && hv?.strongSyntheticEvidence && !hv?.strongHumanEvidence) ||
      (handwriting.verdict === "likely-ai" && !hv?.strongHumanEvidence)
    )
  ) {
    const manualReview = hvConfidence < 70 ? " Manual review recommended." : "";
    return {
      ...report,
      title: "Handwritten Assignment — Uncertain",
      truthScore: Math.min(Number(report.truthScore) || 50, 50),
      confidence: Math.max(Math.min(Number(report.confidence) || 50, 65), handwriting.confidence, Math.min(hvConfidence, 65)),
      status: "uncertain",
      riskLevel: "moderate",
      explanation: `${hwSummary} Mixed or insufficient forensic evidence — strong AI indicators present without matching human characteristics.${manualReview} ${forensicNotes}`.trim().slice(0, 480),
    };
  }

  if (visionSaysGenuine && report.status !== "ai-generated") {
    return {
      ...report,
      title: report.title || "Handwritten Assignment — Original Handwritten",
      truthScore: Math.max(Number(report.truthScore) || 75, Math.min(95, Math.round(hvHuman))),
      confidence: Math.max(Number(report.confidence) || 0, hvConfidence, handwriting.confidence),
      status: "authentic",
      riskLevel: /LOW/i.test(hv?.riskLevel || "") ? "low" : report.riskLevel || "low",
      explanation: `${hwSummary} Multiple independent human handwriting characteristics observed.${forensicNotes ? ` ${forensicNotes}` : ""}`.trim().slice(0, 480),
    };
  }

  return {
    ...report,
    explanation: `${report.explanation || ""} ${hwSummary} ${forensicNotes}`.trim().slice(0, 480),
  };
}

/** Map the vision classifier's JSON → the report shape (forensics optional, supplementary). */
function mapVisionClassification(raw: any, label: string, forensics: ForensicReport | null, handwriting: HandwritingReport | null, handwritingVision: any | null = null): any {
  // classification: AUTHENTIC | SYNTHETIC | MANIPULATED | INSUFFICIENT_EVIDENCE
  // (also tolerates older labels: REAL_CAMERA / AI_GENERATED / UNCERTAIN)
  // The PROMPT makes the decision (classification). Code only maps it — no threshold.
  const cls = String(raw?.classification || "INSUFFICIENT_EVIDENCE").toUpperCase().trim();
  const conf = score0To100(raw?.confidence, 50);
  const cam = score0To100(raw?.camera_realism_score, NaN);
  const syn = score0To100(raw?.synthetic_score, NaN);
  const status = /^(SYN|AI)/.test(cls) ? "ai-generated"
    : /^MANIP/.test(cls) ? "manipulated"
    : /^(AUTH|REAL)/.test(cls) ? "authentic"
    : "uncertain"; // INSUFFICIENT_EVIDENCE / UNCERTAIN

  // truthScore = authenticity gauge, consistent with the verdict.
  const truthScore = status === "uncertain" ? 50
    : status === "ai-generated" ? Math.max(5, Math.min(45, Math.round(Number.isFinite(syn) ? 100 - syn : 30)))
    : Math.max(55, Math.min(95, Math.round(Number.isFinite(cam) ? cam : (Number.isFinite(syn) ? 100 - syn : 75))));

  const junk = (s: string) => { const v = s.trim().toLowerCase(); return !v || v === "none" || v === "n/a" || v === "na"; };
  const failures: any[] = Array.isArray(raw?.independent_failures) ? raw.independent_failures : [];
  const counter = String(raw?.counter_argument || "").trim();
  const alts: string[] = (Array.isArray(raw?.alternative_explanations) ? raw.alternative_explanations.map(String) : []).filter((s: string) => !junk(s));

  // Metrics (suspicion-oriented: high = more synthetic).
  const metrics: any[] = [];
  if (Number.isFinite(syn)) { const s = Math.max(0, Math.min(100, Math.round(syn))); metrics.push({ name: "Synthetic Evidence", score: s, label: labelFor(s), description: "Overall synthesis suspicion (0 = clean, 100 = generated)." }); }
  if (Number.isFinite(cam)) { const s = Math.max(0, Math.min(100, Math.round(100 - cam))); metrics.push({ name: "Camera-Realism Deficit", score: s, label: labelFor(s), description: `Camera realism ${Math.round(cam)}/100 (shown as inverse suspicion).` }); }
  // Independent failures as additional metrics (strength scaled to 0–100).
  for (const f of failures.slice(0, 4)) {
    if (junk(String(f?.finding || ""))) continue;
    let st = Number(f?.strength);
    if (!Number.isFinite(st)) st = 60;
    const sc = Math.max(0, Math.min(100, Math.round(st <= 10 ? st * 10 : st)));
    metrics.push({ name: String(f?.region || "Independent failure").slice(0, 40), score: sc, label: labelFor(sc), description: String(f?.finding || "").slice(0, 200) });
  }
  if (forensics && !forensics.insufficient) metrics.push(...measurementsToMetrics(forensics));
  if (metrics.length === 0) metrics.push({ name: "Vision analysis", score: 50, label: "MODERATE", description: "No specific indicators returned." });

  const failCount = failures.filter((f) => !junk(String(f?.finding || ""))).length;
  const summary = (counter ? "" : "") +
    `${cls} — ${failCount} independent failure${failCount === 1 ? "" : "s"} (synthetic ${Number.isFinite(syn) ? Math.round(syn) : "?"}/100, camera-realism ${Number.isFinite(cam) ? Math.round(cam) : "?"}/100).` +
    (counter ? ` Self-critique: ${counter}` : "");

  const report = {
    title: `DeepFakeJudge — ${cls}`,
    truthScore,
    confidence: conf,
    status,
    riskLevel: truthScore < 40 ? "high" : truthScore < 60 ? "moderate" : "low",
    explanation: summary.slice(0, 480),
    metrics,
    counterEvidence: alts,
    resolution: forensics ? forensics.analyzedResolution : "Uploaded image",
    colorSpace: "sRGB",
    bitDepth: "GPT-4o vision (DeepFakeJudge-v7)",
    method: "GPT-4o DeepFakeJudge-v7 classification" + (forensics ? " + supplementary pixel-forensics" : ""),
    measurements: forensics ? forensics.measurements : undefined,
    forensics: forensics || undefined,
  };
  return applyHandwritingVerdict(report, handwriting, handwritingVision);
}

/** Each category's measured score → a UI metric, described by its evidence item. */
function measurementsToMetrics(f: ForensicReport) {
  const m = f.measurements;
  const desc = (cat: string) => m.evidence.find((e) => e.category === cat)?.detail || "";
  return [
    { name: "Texture Analysis", score: m.texture_score, label: labelFor(m.texture_score), description: desc("texture") },
    { name: "Noise Analysis", score: m.noise_score, label: labelFor(m.noise_score), description: desc("noise") },
    { name: "Frequency Analysis", score: m.frequency_score, label: labelFor(m.frequency_score), description: desc("frequency") },
    { name: "Compression Analysis", score: m.compression_score, label: labelFor(m.compression_score), description: desc("compression") },
    { name: "Metadata Analysis", score: m.metadata_score, label: labelFor(m.metadata_score), description: desc("metadata") },
  ];
}

/** Ask OpenAI to narrate the measured forensic evidence (text only, no image, no scoring). */
async function explainMeasurements(openai: OpenAI, f: ForensicReport, label: string): Promise<{ title?: string; explanation?: string } | null> {
  const payload = {
    subject: label,
    verdict: f.verdict,
    ai_probability: f.aiProbability,
    confidence: f.confidence,
    model_family_hint: f.modelHint,
    measurements: f.measurements,
  };
  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4o",
    messages: [
      { role: "system", content: EXPLAIN_PROMPT },
      { role: "user", content: `Forensic measurements for a ${label} (computed by the pipeline — explain them, do not change them):\n\n${JSON.stringify(payload, null, 2)}` },
    ],
    response_format: { type: "json_object" },
    temperature: 0.2,
    max_tokens: 500,
  });
  try { return JSON.parse(response.choices[0].message.content || "{}"); }
  catch { return null; }
}

/** Build the UI report. Verdict + every score come from the FORENSIC pipeline. */
function buildForensicLedReport(f: ForensicReport, expl: { title?: string; explanation?: string } | null, label: string, handwriting: HandwritingReport | null = null, handwritingVision: any | null = null): any {
  const status = f.verdict === "likely-ai" ? "ai-generated"
    : f.verdict === "likely-real" ? "authentic" : "uncertain";
  const truthScore = f.authenticityScore;
  const report = {
    title: (expl?.title) || `Forensic analysis — ${label}`,
    truthScore,
    confidence: f.confidence,
    status,
    riskLevel: truthScore < 40 ? "high" : truthScore < 60 ? "moderate" : "low",
    explanation: (expl?.explanation) ||
      `Forensic pipeline verdict: ${f.verdict} (measured AI-probability ${f.aiProbability}%, confidence ${f.confidence}%).`,
    metrics: measurementsToMetrics(f),
    resolution: f.analyzedResolution,
    colorSpace: "sRGB (pixel-domain scan)",
    bitDepth: "FFT · wavelet · LBP · noise-residual · EXIF",
    method: `Forensic pipeline measured all scores; OpenAI only explained the evidence${f.calibrated ? " (trained model)" : " (heuristic calibration)"}`,
    measurements: f.measurements,
    forensics: f,
  };
  return applyHandwritingVerdict(report, handwriting, handwritingVision);
}

/** Always-valid response when the pipeline throws — the frontend renders this
 *  instead of seeing a dropped/failed request. */
function safeFallbackReport(message?: string): any {
  return {
    // 'uncertain' is a status the UI can render; the raw "error_safe_fallback"
    // marker is kept as a separate flag so clients/telemetry can detect it.
    status: "uncertain",
    error_safe_fallback: true,
    title: "Analysis Unavailable",
    truthScore: 50,
    confidence: 50,
    verdict: "uncertain",
    riskLevel: "moderate",
    explanation: "A safe fallback was returned due to an internal processing error — the image could not be fully analyzed." + (message ? ` (${message})` : ""),
    metrics: [],
    resolution: "N/A",
    colorSpace: "N/A",
    bitDepth: "N/A",
    method: "Safe fallback (analysis error)",
    message: "fallback triggered due to internal processing error",
  };
}

/** Returned when the pipeline cannot extract reliable evidence — never claims authenticity. */
function insufficientReport(f: ForensicReport | null, label: string): any {
  return {
    title: "Insufficient Forensic Evidence",
    truthScore: 50,
    confidence: f ? f.confidence : 0,
    status: "uncertain",
    riskLevel: "moderate",
    explanation: "Insufficient forensic evidence to determine authenticity. The image is too small, low-resolution, or degraded for reliable pixel-level measurement, and no decisive synthetic signature was found. This is NOT a claim of authenticity — only that the evidence is inconclusive.",
    metrics: f ? measurementsToMetrics(f) : [
      { name: "Forensic pipeline", score: 50, label: "MODERATE", description: "No reliable measurements could be extracted from this input." },
    ],
    resolution: f ? f.analyzedResolution : `${label} — undecodable`,
    colorSpace: "N/A",
    bitDepth: "N/A",
    method: "Forensic pipeline — insufficient evidence",
    measurements: f ? f.measurements : undefined,
    forensics: f || undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Server
// ─────────────────────────────────────────────────────────────────────────────

/** Simple in-memory rate limiter (per IP, sliding window). */
function createRateLimiter(maxRequests: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const key = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();
    const windowStart = now - windowMs;
    const recent = (hits.get(key) || []).filter((t) => t > windowStart);
    if (recent.length >= maxRequests) {
      return res.status(429).json({ error: "Too many requests. Please wait a moment and try again." });
    }
    recent.push(now);
    hits.set(key, recent);
    next();
  };
}

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  // ── Helmet — hardened HTTP security headers ────────────────────────────────
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "https://accounts.google.com", "https://apis.google.com"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'", "https://accounts.google.com"],
          frameSrc: ["'none'"],
          objectSrc: ["'none'"],
          upgradeInsecureRequests: process.env.NODE_ENV === "production" ? [] : null,
        },
      },
      hsts: process.env.NODE_ENV === "production"
        ? { maxAge: 31536000, includeSubDomains: true, preload: true }
        : false,
    }),
  );

  // ── CORS ──────────────────────────────────────────────────────────────────
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || "https://halima-ai.supertechholding.com,http://localhost:5173,http://localhost:3000,http://localhost:4173")
    .split(",").map((o) => o.trim());
  app.use(
    cors({
      origin: (origin, cb) => {
        // Allow same-origin requests (no Origin header) and explicitly listed origins
        if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
        cb(new Error(`CORS: origin ${origin} not allowed`));
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
    }),
  );

  // ── Cookie parser (needed for httpOnly refresh-token cookie) ──────────────
  app.use(cookieParser());

  // ── Passport (stateless JWT — no session) ────────────────────────────────
  app.use(passport.initialize());

  // Additional security headers not covered by helmet defaults
  app.use((_req, res, next) => {
    res.setHeader("X-DNS-Prefetch-Control", "off");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    next();
  });

  // Rate-limit expensive AI endpoints
  const analyzeLimiter = createRateLimiter(20, 60_000);
  const chatLimiter = createRateLimiter(40, 60_000);

  // ── Stripe webhook ─────────────────────────────────────────────────────────
  // MUST be registered before express.json() so the raw body is available for
  // signature verification.
  app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), (req, res) => {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    const sig = req.headers["stripe-signature"];
    if (!secret || !sig) {
      return res.status(400).json({ error: "Webhook is not configured." });
    }

    let event: Stripe.Event;
    try {
      event = getStripeClient().webhooks.constructEvent(req.body, sig as string, secret);
    } catch (err: any) {
      console.error("[Stripe] Webhook signature verification failed:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // The frontend confirms Pro status by querying Stripe (GET /api/subscription),
    // so Stripe itself is the source of truth. These events are logged and are a
    // hook for future side effects (welcome email, analytics, dunning, etc.).
    switch (event.type) {
      case "checkout.session.completed":
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        console.log(`[Stripe] Received ${event.type}`);
        break;
      default:
        break;
    }

    res.json({ received: true });
  });

  app.use(express.json({ limit: "25mb" }));

  // ── Auth API routes (/auth/register, /auth/login, /auth/logout, etc.) ─────
  // This mounts the entire auth system — JWT issuance, Google OAuth, refresh
  // token rotation, email verification, password reset, and RBAC middleware.
  app.use("/auth", authRoutes);

  // Healthcheck
  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", time: new Date().toISOString() });
  });

  // Frontend feature-availability probe (does not expose secrets).
  app.get("/api/config", (_req, res) => {
    res.json({ stripeEnabled: stripeConfigured() });
  });

  // ── Create a Stripe Checkout session for the $3/mo Pro plan ────────────────
  app.post("/api/checkout", authenticate, async (req, res) => {
    try {
      if (!stripeConfigured()) {
        return res.status(503).json({ error: "Payments are not configured on this server yet." });
      }
      const { email } = req.body ?? {};
      const stripe = getStripeClient();
      const base = publicBaseUrl(req);

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [{ price: process.env.STRIPE_PRICE_ID!, quantity: 1 }],
        customer_email: email || req.user?.email || undefined,
        allow_promotion_codes: true,
        success_url: `${base}/?upgrade=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${base}/?upgrade=cancelled`,
      });

      res.json({ url: session.url });
    } catch (err: any) {
      console.error("[Stripe] Checkout error:", err);
      res.status(500).json({ error: err.message || "Failed to create checkout session." });
    }
  });

  // ── Check whether an email has an active Pro subscription ──────────────────
  // Stripe is the source of truth, so no local user database is required.
  app.get("/api/subscription", async (req, res) => {
    try {
      const email = String(req.query.email ?? "").trim().toLowerCase();
      if (!stripeConfigured() || !email) return res.json({ isPro: false });

      const stripe = getStripeClient();
      const customers = await stripe.customers.list({ email, limit: 5 });

      for (const customer of customers.data) {
        const subs = await stripe.subscriptions.list({
          customer: customer.id,
          status: "all",
          limit: 10,
        });
        const active = subs.data.some(
          (s) => s.status === "active" || s.status === "trialing"
        );
        if (active) return res.json({ isPro: true });
      }

      res.json({ isPro: false });
    } catch (err: any) {
      console.error("[Stripe] Subscription lookup error:", err);
      res.json({ isPro: false });
    }
  });

  // ── Main Analysis Endpoint ────────────────────────────────────────────────
  app.post("/api/analyze", authenticate, analyzeLimiter, async (req, res) => {
    try {
      const { text, type, imageBase64, mimeType } = req.body;
      if (!text && !imageBase64) {
        return res.status(400).json({ error: "Text or an image is required for analysis." });
      }

      // Offline fallback
      if (!process.env.OPENAI_API_KEY) {
        const safeText = (text || "file").slice(0, 30);
        return res.json({
          title: `Inconclusive: ${safeText}${(text || "").length > 30 ? "..." : ""}`,
          // Honest: with no analysis backend configured we cannot judge authenticity.
          truthScore: 50,
          confidence: 0,
          status: "manipulated",
          riskLevel: "moderate",
          explanation: "Analysis engine is offline (no API key configured), so no real forensic evaluation was performed. This is a neutral placeholder, not a verdict — configure OPENAI_API_KEY for genuine analysis.",
          metrics: [
            { name: "Visual / Facial Artifacts", score: 50, label: "MODERATE", description: "Not assessable — analysis engine offline." },
            { name: "Generation / Manipulation Signatures", score: 50, label: "MODERATE", description: "Not assessable — analysis engine offline." },
            { name: "Content & Source Integrity", score: 50, label: "MODERATE", description: "Not assessable — analysis engine offline." }
          ],
          resolution: "N/A (offline)",
          colorSpace: "N/A",
          bitDepth: "N/A",
          method: "Offline placeholder (no analysis performed)"
        });
      }

      const openai = getOpenAIClient();
      const inputIsUrl = isUrl(text || "");
      if (inputIsUrl && !isSafePublicUrl(String(text).trim())) {
        return res.status(400).json({ error: "Only public http(s) URLs are allowed for link analysis." });
      }

      // Resolve the image (uploaded file or URL thumbnail): bytes for forensics,
      // data-URL for the vision classifier.
      let imageBytes: Buffer | null = null;
      let imageDataUrl: string | null = null;
      let imageLabel = "uploaded image";
      let contextSummary = "";

      if (inputIsUrl) {
        const platform = detectPlatform(text);
        const platformLabel = PLATFORM_LABELS[platform];
        console.log(`[TruthAI] Fetching media context for ${platformLabel}: ${text}`);
        const ctx = await fetchMediaContext(text);
        contextSummary = [
          ctx.title && `Title: "${ctx.title}"`,
          ctx.author && `Creator/Channel: "${ctx.author}"`,
          ctx.description && `Description: "${ctx.description.slice(0, 300)}"`,
        ].filter(Boolean).join("\n");
        if (ctx.thumbnailBase64) {
          imageBytes = base64ToBuffer(ctx.thumbnailBase64);
          imageDataUrl = ctx.thumbnailBase64;
          imageLabel = `${platformLabel} video thumbnail (single frame)`;
        }
      } else if (imageBase64) {
        imageBytes = base64ToBuffer(imageBase64);
        imageDataUrl = `data:${mimeType || "image/jpeg"};base64,${imageBase64}`;
      }

      // Optimize image payload size for OpenAI Vision API using sharp downscaling
      if (imageBytes) {
        try {
          const optimizedUrl = await resizeImageForVision(imageBytes);
          if (optimizedUrl) {
            imageDataUrl = optimizedUrl;
            console.log(`[TruthAI] Resized image for vision model: ${optimizedUrl.length} characters`);
          }
        } catch (err: any) {
          console.warn("[TruthAI] Failed to resize image for vision model:", err.message);
        }
      }

      // ── IMAGE PATH: GPT-4o VISION classifies (authoritative); forensics is supplementary. ──
      if (imageBase64 && (!imageBytes || imageBytes.length === 0)) {
        return res.json(insufficientReport(null, "uploaded image (unreadable)"));
      }
      if (imageDataUrl) {
        // 1) GPT-4o vision classification — the authoritative image verdict.
        const visionRaw = await classifyImageWithVision(openai, imageDataUrl).catch((e) => {
          console.warn("[vision] failed:", e);
          return null;
        });
        console.log("[visionRaw]:", JSON.stringify(visionRaw, null, 2));

        // 2) Supplementary pixel-forensics (best effort; never blocks the vision verdict).
        const forensics = imageBytes
          ? await analyzeImageForensics(imageBytes).catch(() => null)
          : null;
        const isAssignmentMode = type === "assignment";
        const handwriting = imageBytes
          ? await analyzeHandwritingForensics(imageBytes, isAssignmentMode).catch((e) => {
              console.warn("[handwriting] failed:", e);
              return null;
            })
          : null;
        console.log("[handwriting]:", handwriting?.applicable
          ? JSON.stringify({
              verdict: handwriting.verdict,
              syntheticProbability: handwriting.syntheticProbability,
              confidence: handwriting.confidence,
              topSignals: handwriting.signals.slice(0, 4).map((s) => `${s.name}:${s.score}`),
            })
          : JSON.stringify({ applicable: false, reason: handwriting?.evidence?.[0] || "not evaluated" }));
        const handwritingVision = handwriting?.applicable
          ? await classifyHandwritingWithVision(openai, imageDataUrl).catch((e) => {
              console.warn("[handwritingVision] failed:", e);
              return null;
            })
          : null;
        if (handwritingVision) console.log("[handwritingVision]:", JSON.stringify(handwritingVision, null, 2));

        // 3) Vision drives generic image/video verdicts, but handwritten
        // assignment morphology is allowed to override document false negatives.
        if (visionRaw) {
          return res.json(mapVisionClassification(visionRaw, imageLabel, forensics, handwriting, handwritingVision));
        }
        if (forensics && !forensics.insufficient) {
          return res.json(buildForensicLedReport(forensics, null, imageLabel, handwriting, handwritingVision));
        }
        if (handwriting?.applicable) {
          return res.json(applyHandwritingVerdict(insufficientReport(forensics, imageLabel), handwriting, handwritingVision));
        }
        return res.json(insufficientReport(forensics, imageLabel));
      }

      // ── TEXT / URL-without-image PATH: linguistic/context assessment. ─────────
      const userContent = inputIsUrl
        ? `Assess this web/social content for AI generation based on its text context (no image was retrievable):\n${contextSummary || text}`
        : `Analyze the following ${type || "text"} content for AI generation and return ONLY the JSON:\n\n"${text}"`;

      const response = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || "gpt-4o",
        messages: [
          { role: "system", content: TEXT_PROMPT },
          { role: "user", content: userContent }
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
        seed: 7,
        max_tokens: 900
      });

      res.json(JSON.parse((response.choices[0].message.content || "").trim()));

    } catch (err: any) {
      // STEP 5/6 — never crash or drop the connection: always return valid JSON.
      console.error("[/api/analyze] fallback:", err?.message || err);
      if (!res.headersSent) res.status(200).json(safeFallbackReport(err?.message));
    }
  });

  // ── Chat / Follow-up endpoint ────────────────────────────────────────────
  app.post("/api/chat", authenticate, chatLimiter, async (req, res) => {
    try {
      const { userMessage, chatHistory, reportContext } = req.body;
      if (!userMessage) {
        return res.status(400).json({ error: "userMessage is required." });
      }

      if (!process.env.OPENAI_API_KEY) {
        return res.json({
          text: `[Offline Mode] Diagnostic response for: "${reportContext?.title || "the analysis"}". Truth score: ${reportContext?.truthScore || "N/A"}% — Status: '${reportContext?.status || "AI Generated"}'. Ask anything for further breakdown.`
        });
      }

      const openai = getOpenAIClient();

      const contextPrompt = `You are TruthAI, an expert cyber forensic assistant specializing in deepfake & synthetic media detection.
You are chatting with a user about a specific synthetic content scan they just completed.
Report context:
-----------------------
Title: ${reportContext?.title || "Unknown Scan"}
Status/Verdict: ${reportContext?.status || "Analyzing"} — Truth Score: ${reportContext?.truthScore || 50}% (100% = fully real, 0% = certain deepfake)
Risk Level: ${reportContext?.riskLevel || "Moderate"}
Explanation: ${reportContext?.explanation || "No explanation provided"}
-----------------------

Formulate a precise, technically sound response. Focus on forensic details: GAN models (FaceSwap, DeepFaceLab, Midjourney, Sora, RunwayML), EXIF anomalies, spectral analysis, and actionable intelligence.
Keep responses direct, readable, professional — max 3 paragraphs. Use bullet points where appropriate.`;

      const messages: any[] = [
        { role: "system", content: contextPrompt },
        ...(chatHistory || []).map((msg: any) => ({
          role: msg.role === "assistant" ? "assistant" : "user",
          content: msg.text
        })),
        { role: "user", content: userMessage }
      ];

      const response = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || "gpt-4o",
        messages,
        temperature: 0.7
      });

      res.json({ text: response.choices[0].message.content || "No response generated." });
    } catch (err: any) {
      console.error("OpenAI Chat Error:", err);
      res.status(500).json({ error: err.message || "Internal server error during chat." });
    }
  });

  // ── Vite / Static serving ────────────────────────────────────────────────
  if (process.env.NODE_ENV !== "production") {
    // Lazily load Vite only in development so production runtimes don't need
    // it installed (it is a devDependency). Keeps the production image lean.
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("Vite development middleware mounted successfully.");
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => res.sendFile(path.join(distPath, "index.html")));
    console.log("Production static server enabled.");
  }

  // ── Error-handling middleware (LAST) ───────────────────────────────────────
  // Converts body-parser failures (payload too large, malformed JSON) and any
  // un-caught route error into clean JSON, so the browser never sees a dropped
  // connection / "Failed to fetch".
  app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("[express:error]", err?.type || err?.name, err?.message);
    if (res.headersSent) return next(err);
    const status = err?.type === "entity.too.large" ? 413 : 400;
    res.status(status).json({
      error_safe_fallback: true,
      status: "uncertain",
      message: err?.type === "entity.too.large"
        ? "Image is too large to analyze (over the 25 MB upload limit)."
        : (err?.message || "Request could not be processed."),
    });
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`TruthAI Server listening on port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
});
