# TruthAI Detector

An AI-powered forensic dashboard for detecting deepfakes, manipulated text, and
synthetic media. A React (Vite) frontend and an Express API are served together
from a single Node process; analysis is powered by the OpenAI API.

## Stack

- **Frontend:** React 19 + Vite 6 + Tailwind CSS 4
- **Backend:** Express 4 (`server.ts`, bundled to `dist/server.cjs` with esbuild)
- **AI:** OpenAI (`gpt-4o` by default), with an offline diagnostic fallback when
  no API key is set

## Local development

```bash
npm install
cp .env.example .env        # then put your real OPENAI_API_KEY in .env
npm run dev                 # Vite dev server + API on http://localhost:3000
```

Without an `OPENAI_API_KEY` the app still runs and returns a heuristic
"offline" verdict, so you can develop the UI without a key.

## Production build

```bash
npm run build               # builds the frontend (dist/) and server (dist/server.cjs)
NODE_ENV=production npm start
```

`npm start` runs `node dist/server.cjs`, which serves the built frontend and the
API from one port (`PORT`, default `3000`).

## Environment variables

| Variable                 | Where     | Required | Notes                                                              |
| ------------------------ | --------- | -------- | ------------------------------------------------------------------ |
| `OPENAI_API_KEY`         | backend   | yes\*    | \*Without it the API returns an offline fallback verdict.          |
| `OPENAI_MODEL`           | backend   | no       | Defaults to `gpt-4o`.                                              |
| `STRIPE_SECRET_KEY`      | backend   | for Pro  | Enables the $3/mo Pro Checkout. Without it, upgrade is disabled.   |
| `STRIPE_PRICE_ID`        | backend   | for Pro  | The recurring Price ID for the $3/month plan.                     |
| `STRIPE_WEBHOOK_SECRET`  | backend   | for Pro  | Signing secret for `/api/stripe/webhook`.                         |
| `PUBLIC_BASE_URL`        | backend   | no       | App origin for Stripe redirects. Falls back to the request origin. |
| `PORT`                   | backend   | no       | Defaults to `3000`. Render/most hosts set this automatically.     |
| `NODE_ENV`               | backend   | prod     | Must be `production` in production to serve the static build.     |
| `VITE_GOOGLE_CLIENT_ID`  | frontend  | no       | Enables "Continue with Google". Inlined at build time.            |
| `VITE_API_BASE_URL`      | frontend  | no       | Leave empty for the single-service setup (same-origin API calls). |

`VITE_*` vars are inlined at **build** time — set them before `npm run build`.
Everything still runs without the optional vars: no Google ID → email sign-in
only; no Stripe → the app stays on the free tier.

## Plans (freemium)

| | **Free** | **Pro — $3/mo** |
| --- | --- | --- |
| Daily scans | 5 / day | Unlimited |
| Detection results | Basic verdict + score | Advanced signals + confidence scores |
| Scan history | Not saved | Full saved history & logs |
| PDF reports | — | Downloadable PDF |
| Social-link verification | — | ✓ |
| Branding | Branded report | Unbranded |

The free daily limit is metered per browser (localStorage). Pro entitlement is
verified server-side against Stripe on every load, so it can't be forged.

## Authentication

- The app runs immediately as a **guest** (free tier) — no account required.
- The profile control (top-right) opens the login page.
- **Email**: signing in with a new email creates a local account; an existing
  one is validated against its stored password.
- **Google**: real Google Identity Services sign-in. Requires
  `VITE_GOOGLE_CLIENT_ID`; otherwise the Google button is hidden.

### Google OAuth setup (optional)

1. [Google Cloud Console](https://console.cloud.google.com) → **APIs & Services
   → Credentials → Create OAuth client ID → Web application**.
2. Add your origin (e.g. `https://truthai.onrender.com` and
   `http://localhost:3000`) to **Authorized JavaScript origins**.
3. Set the resulting client ID as `VITE_GOOGLE_CLIENT_ID` and rebuild.

### Stripe setup (for the Pro plan)

1. In [Stripe](https://dashboard.stripe.com): **Products** → create a product
   with a **$3/month recurring price**. Copy the **Price ID** → `STRIPE_PRICE_ID`.
2. Copy your **Secret key** → `STRIPE_SECRET_KEY`.
3. **Developers → Webhooks → Add endpoint**: URL
   `https://<your-app>/api/stripe/webhook`, listen for `checkout.session.*` and
   `customer.subscription.*`. Copy the **Signing secret** → `STRIPE_WEBHOOK_SECRET`.
4. Redeploy. "Upgrade to Pro" now opens real Stripe Checkout; on return, the app
   confirms the active subscription and unlocks Pro.

## Deploy to Render (single service)

A [`render.yaml`](./render.yaml) Blueprint is included.

1. Push this repo to GitHub.
2. In Render: **New + → Blueprint**, select the repo. Render reads `render.yaml`.
3. When prompted (or in the service's **Environment** tab afterward), set
   `OPENAI_API_KEY`. For the Pro plan also set `STRIPE_SECRET_KEY`,
   `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`; for Google sign-in set
   `VITE_GOOGLE_CLIENT_ID`. See the setup sections below.
4. Deploy. Render runs `npm ci --include=dev && npm run build`, then
   `npm start`. Health checks hit `/api/health`.

The app will be live at `https://<your-service>.onrender.com`.

> **Note on the build command:** `--include=dev` is required because the build
> needs `vite`/`esbuild` (devDependencies) even though `NODE_ENV=production`.
> The bundled server loads `vite` lazily, so the running app does **not** need
> it at runtime.

## Deploy with Docker (any host)

A multi-stage [`Dockerfile`](./Dockerfile) produces a lean runtime image.

```bash
docker build -t truthai-detector .
docker run -p 3000:3000 -e OPENAI_API_KEY=sk-... truthai-detector
```

Then open http://localhost:3000.

## API

| Method | Path                   | Body / Query                                  | Purpose                              |
| ------ | ---------------------- | --------------------------------------------- | ------------------------------------ |
| GET    | `/api/health`          | —                                             | Health check.                        |
| GET    | `/api/config`          | —                                             | Feature flags (`stripeEnabled`).     |
| POST   | `/api/analyze`         | `{ text, type, imageBase64?, mimeType? }`     | Forensic analysis (JSON verdict).    |
| POST   | `/api/chat`            | `{ userMessage, chatHistory, reportContext }` | Follow-up Q&A about a report.        |
| POST   | `/api/checkout`        | `{ email }`                                   | Create a Stripe Checkout session.    |
| GET    | `/api/subscription`    | `?email=`                                     | Whether the email has active Pro.    |
| POST   | `/api/stripe/webhook`  | Stripe event (raw)                            | Stripe subscription lifecycle.       |

`/api/analyze` accepts plain text, a social/media URL (YouTube, TikTok, X,
Instagram, Facebook, …) whose thumbnail it fetches, or an uploaded image as
base64.

## Image forensics (AI-generation detection)

Uploaded images (and URL thumbnails) are analysed at the **pixel level** in
[`forensics.ts`](./forensics.ts) — using only visual evidence inside the raster,
never metadata/EXIF/watermarks. The signal battery:

| Signal | Technique |
| --- | --- |
| Fourier power-spectrum slope | 2D FFT, azimuthal (radial) power profile vs natural 1/fⁿ law |
| High-frequency artifacts | high-band spectral energy fraction |
| GAN up-sampling peaks | off-axis periodic spectral-peak prominence |
| Noise residual (level & shape) | high-pass residual σ + kurtosis |
| Wavelet statistics | 1-level Haar HH sub-band energy + coefficient kurtosis |
| Local Binary Patterns | micro-pattern histogram entropy |
| Texture inconsistency | block-variance dispersion |
| Pixel distribution | intensity-histogram comb / clipping |
| Color anomalies | inter-channel correlation |
| Edge consistency | Sobel gradient-density uniformity |
| Repeated patterns | residual autocorrelation periodicity |

Each signal is squashed to a 0–100 suspicion and **fused** into one
AI-probability, which is then blended with the vision model's semantic read
(weighted by the scan's own confidence). The result drives the verdict and the
per-signal metrics shown on the report.

### Calibrating for real accuracy

The default fusion uses literature-informed **heuristic** weights — good for
ranking, but absolute scores aren't trustworthy until trained on labelled data.
To get genuinely accurate scores, learn the combination:

```
calibration/real/   ← genuine camera photos (200+ ideal)
calibration/ai/     ← AI-generated images (Midjourney, SD, DALL·E, GANs…)

npm run calibrate
```

This trains a logistic regression over the 12 signals, reports **held-out
accuracy**, and writes `forensics-model.json`. The server auto-loads it on the
next start and uses the learned weights instead of the heuristics. (Honest
ceiling: hand-crafted features + a linear model is strong and explainable, but
the state of the art for the hardest cases is a trained CNN — the architecture
here is ready to swap one in behind the same `analyzeImageForensics` interface.)

## Security note

The AI-backed endpoints (`/api/analyze`, `/api/chat`) are currently open and
unmetered — each call bills your OpenAI key. Before exposing the URL publicly,
consider putting it behind auth, a gateway, or per-IP rate limiting.
