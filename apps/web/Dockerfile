FROM node:22-alpine AS build
WORKDIR /repo
RUN corepack enable
ENV npm_config_registry=https://registry.npmmirror.com
ARG API_ORIGIN
ENV API_ORIGIN=${API_ORIGIN}
COPY pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY packages/scene/package.json packages/scene/
COPY packages/content/package.json packages/content/
# 依赖层挂载 pnpm store 缓存：未变依赖直接复用，不再重复下载
RUN --mount=type=cache,target=/root/.local/share/pnpm/store pnpm install --filter @jenrimark/web... --registry=https://registry.npmmirror.com
COPY . .
RUN pnpm --filter @jenrimark/web build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
