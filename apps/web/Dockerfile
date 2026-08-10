# syntax=docker/dockerfile:1.7

FROM node:24-bookworm-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="${PNPM_HOME}:${PATH}"

RUN corepack enable

WORKDIR /workspace

FROM base AS development-dependencies

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/package.json
COPY packages/shared/package.json ./packages/shared/package.json

RUN --mount=type=cache,id=pnpm-web-development,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @knowledgestack/web...

FROM development-dependencies AS build

COPY tsconfig.base.json ./
COPY apps/web/next.config.mjs apps/web/tsconfig.json ./apps/web/
COPY apps/web/app ./apps/web/app
COPY packages/shared/tsconfig.json ./packages/shared/
COPY packages/shared/src ./packages/shared/src

RUN pnpm --filter @knowledgestack/web... build

FROM node:24-bookworm-slim AS production

ENV NODE_ENV="production"
ENV HOSTNAME="0.0.0.0"
ENV PORT="3000"

WORKDIR /app

COPY --from=build --chown=node:node /workspace/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /workspace/apps/web/.next/static ./apps/web/.next/static

WORKDIR /app/apps/web

USER node

EXPOSE 3000

CMD ["node", "server.js"]
