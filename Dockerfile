# Portable multi-stage build — runs the full TruthAI app (API + static frontend)
# from a single container on any Docker host (Render, Fly, Railway, a VPS…).

# ── Stage 1: build the frontend bundle and the server bundle ──────────────────
FROM node:22-slim AS builder
WORKDIR /app

# Install ALL deps (incl. devDependencies: vite, esbuild) for the build.
COPY package.json package-lock.json ./
RUN npm ci --include=dev

COPY . .
RUN npm run build

# ── Stage 2: lean runtime with production deps only ───────────────────────────
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# Only the packages the bundled server actually requires at runtime
# (express, openai, dotenv — vite is loaded lazily and skipped in production).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Built frontend (dist/assets, dist/index.html) and bundled server.
COPY --from=builder /app/dist ./dist

EXPOSE 3000
CMD ["node", "dist/server.cjs"]
