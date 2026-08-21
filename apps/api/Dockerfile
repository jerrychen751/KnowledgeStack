# syntax=docker/dockerfile:1.7

FROM node:24-bookworm-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="${PNPM_HOME}:${PATH}"

RUN apt-get update \
    && apt-get install --yes --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable

WORKDIR /workspace

FROM base AS development-dependencies

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/package.json
COPY packages/shared/package.json ./packages/shared/package.json

RUN --mount=type=cache,id=pnpm-api-development,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @knowledgestack/api...

FROM base AS production-dependencies

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/package.json
COPY packages/shared/package.json ./packages/shared/package.json

RUN --mount=type=cache,id=pnpm-api-production,target=/pnpm/store \
    pnpm install --prod --frozen-lockfile --filter @knowledgestack/api... \
    && mkdir -p packages/shared/node_modules

FROM development-dependencies AS build

COPY tsconfig.base.json ./
COPY apps/api/nest-cli.json apps/api/prisma.config.ts apps/api/tsconfig.json ./apps/api/
COPY apps/api/prisma ./apps/api/prisma
COPY apps/api/src ./apps/api/src
COPY packages/shared/tsconfig.json ./packages/shared/
COPY packages/shared/src ./packages/shared/src

RUN DB_DIRECT_URL=postgresql://placeholder:placeholder@127.0.0.1:5432/placeholder \
    pnpm --filter @knowledgestack/api exec prisma generate --config=prisma.config.ts
RUN pnpm --filter @knowledgestack/api... build

FROM build AS migration

WORKDIR /workspace/apps/api

USER node

CMD ["node", "node_modules/prisma/build/index.js", "migrate", "deploy", "--config=prisma.config.ts"]

FROM node:24-bookworm-slim AS production

ENV NODE_ENV="production"
ENV HOST="0.0.0.0"
ENV PORT="3001"

WORKDIR /workspace/apps/api

COPY --from=production-dependencies --chown=node:node /workspace/node_modules /workspace/node_modules
COPY --from=production-dependencies --chown=node:node /workspace/apps/api/node_modules ./node_modules
COPY --from=production-dependencies --chown=node:node /workspace/packages/shared/node_modules /workspace/packages/shared/node_modules
COPY --from=build --chown=node:node /workspace/apps/api/package.json ./package.json
COPY --from=build --chown=node:node /workspace/apps/api/dist ./dist
COPY --from=build --chown=node:node /workspace/packages/shared/package.json /workspace/packages/shared/package.json
COPY --from=build --chown=node:node /workspace/packages/shared/dist /workspace/packages/shared/dist

RUN mkdir -p /data/uploads && chown node:node /data/uploads

USER node

EXPOSE 3001

CMD ["node", "dist/main.js"]
