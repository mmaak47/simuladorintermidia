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
RUN mkdir -p /app/apps/web/public /app/apps/web/generated

# Generate Prisma client + run build
WORKDIR /app/apps/web
ENV DATABASE_URL=file:/data/dooh.db
RUN npx prisma generate
ENV DOCKER_BUILD=1
RUN cd /app && npx turbo build --filter=@dooh/web

# ── Stage 3: Production runner ─────────────────────────────
FROM node:20-bookworm-slim AS runner
WORKDIR /app/apps/web

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy runtime deps and build artifacts
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/apps/web/package.json ./package.json
COPY --from=builder /app/apps/web/.next ./.next
COPY --from=builder /app/apps/web/public ./public
COPY --from=builder /app/apps/web/generated ./generated
COPY --from=builder /app/apps/web/prisma ./prisma

# SQLite database will be mounted as a volume
RUN mkdir -p /data
RUN chown -R nextjs:nodejs /app /data

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["npx", "next", "start", "--hostname", "0.0.0.0", "--port", "3000"]
