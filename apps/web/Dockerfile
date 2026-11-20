FROM node:24-alpine AS base
WORKDIR /app
RUN npm install -g pnpm@10.33.0

FROM base AS builder
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/web/package.json ./apps/web/
RUN pnpm install --frozen-lockfile || pnpm install
COPY apps/web ./apps/web
RUN pnpm --filter @event-platform/web build

FROM base AS runner
ENV NODE_ENV=production
COPY --from=builder /app/package.json /app/pnpm-workspace.yaml ./
COPY --from=builder /app/apps/web/package.json ./apps/web/
COPY --from=builder /app/apps/web/.next ./apps/web/.next
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/web/node_modules ./apps/web/node_modules
EXPOSE 3000
CMD ["pnpm", "--filter", "@event-platform/web", "start"]
