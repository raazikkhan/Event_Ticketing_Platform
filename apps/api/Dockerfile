FROM node:24-alpine AS base
WORKDIR /app
RUN npm install -g pnpm@10.33.0

FROM base AS builder
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/api/package.json ./apps/api/
RUN pnpm install --frozen-lockfile || pnpm install
COPY apps/api ./apps/api
RUN pnpm --filter @event-platform/api build

FROM base AS runner
ENV NODE_ENV=production
COPY --from=builder /app/package.json /app/pnpm-workspace.yaml ./
COPY --from=builder /app/apps/api/package.json ./apps/api/
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules
EXPOSE 4000
CMD ["node", "apps/api/dist/index.js"]
