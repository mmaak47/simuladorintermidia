# ── Stage 1: Install dependencies ──────────────────────────
FROM node:20-bookworm-slim AS deps
WORKDIR /app

# Copy workspace root files
COPY package.json turbo.json ./
COPY apps/web/package.json apps/web/
COPY packages/core/package.json packages/core/
COPY packages/render/package.json packages/render/

RUN npm install

# ── Stage 2: Build ─────────────────────────────────────────
FROM node:20-bookworm-slim AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules

# Copy source
COPY package.json turbo.json tsconfig.json ./
COPY packages/ packages/
COPY apps/web/ apps/web/

# Generate Prisma client + run build
WORKDIR /app/apps/web
ENV DATABASE_URL=file:/data/dooh.db
RUN npx prisma generate
ENV DOCKER_BUILD=1
RUN cd /app && npx turbo build --filter=@dooh/web

# ── Stage 3: Production runner ─────────────────────────────
FROM node:20-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy build output
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder /app/apps/web/generated ./apps/web/generated

# Copy Prisma schema + migrations for runtime
COPY --from=builder /app/apps/web/prisma ./apps/web/prisma

# SQLite database will be mounted as a volume
RUN mkdir -p /app/apps/web/prisma /data
RUN chown -R nextjs:nodejs /app /data

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "apps/web/server.js"]
