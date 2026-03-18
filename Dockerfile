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

# Copy standalone server + static assets
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy production node_modules (for Prisma, pg, etc. that standalone may not trace)
COPY --from=deps /app/node_modules ./node_modules

# Copy Prisma generated client (Prisma v7 outputs to src/generated/prisma)
COPY --from=builder /app/src/generated ./src/generated

# Copy Prisma schema + migrations for runtime migration support
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts

# Create upload directory with correct permissions
RUN mkdir -p /app/uploads && chown -R nextjs:nodejs /app/uploads

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Health check - give extra time for migrations on first start
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=5 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# Run migrations then start the server
CMD ["sh", "-c", "npx prisma migrate deploy --schema=./prisma/schema.prisma 2>&1 || echo 'Migration warning (non-fatal)'; node server.js"]
