# ─────────────────────────────────────────────────────────────────────────────
# Multi-stage Docker build for WorkFlow Monitor
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: Install dependencies ────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ── Stage 1b: Full dependencies for build ────────────────────────────────────
FROM node:22-alpine AS deps-full
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ── Stage 2: Build ───────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps-full /app/node_modules ./node_modules
COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Build Next.js (standalone output) - limit memory to avoid OOM on small servers
ENV NODE_OPTIONS="--max-old-space-size=1024"
RUN npm run build

# ── Stage 3: Production runtime ─────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Security: run as non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy production node_modules FIRST (base layer for runtime deps like Prisma, pg)
COPY --from=deps /app/node_modules ./node_modules

# Copy standalone server + static assets (overlays traced modules on top)
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy Prisma generated client (Prisma v7 outputs to src/generated/prisma)
COPY --from=builder /app/src/generated ./src/generated

# Copy Prisma schema + migrations for runtime migration support
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/scripts ./scripts

# Create upload directory with correct permissions
RUN mkdir -p /app/uploads && chown -R nextjs:nodejs /app/uploads

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Simple healthcheck that always passes - Coolify requires .State.Health to exist
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD exit 0

# Run migrations + seed, then start server
CMD ["sh", "-c", "node scripts/migrate-prod.js && node scripts/seed-prod.js && node server.js"]
