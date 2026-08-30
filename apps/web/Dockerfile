# syntax=docker/dockerfile:1.7

FROM node:24-bookworm-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="${PNPM_HOME}:${PATH}"

RUN corepack enable

WORKDIR /workspace

FROM base AS development-dependencies

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/package.json
COPY packages/api-contract/package.json ./packages/api-contract/package.json

RUN --mount=type=cache,id=pnpm-web-development,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @knowledgestack/web...

FROM development-dependencies AS build

COPY tsconfig.base.json ./
COPY apps/web ./apps/web
COPY packages/api-contract/tsconfig.json ./packages/api-contract/
COPY packages/api-contract/src ./packages/api-contract/src

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
