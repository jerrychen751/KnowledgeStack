### Prisma Setup

1. Install Prisma and database adapter.

```
pnpm --filter @knowledgestack/api add -D prisma
pnpm --filter @knowledgestack/api add @prisma/client @prisma/adapter-pg pg dotenv
```

`prisma.config.ts` defines the schema path, migration path, and database URL.
Prisma resolves each relative path from the directory that contains this file.

The Prisma command reads `DB_DIRECT_URL` from `apps/api/.env` during native development.
Compose supplies a URL with the `app-db` service name inside containers.
Run each Prisma command from the repository root with the API package filter.
Prisma manages only `app-db`. The PostgreSQL entrypoint scripts manage `tenant-db`.

Apply all pending migrations:

```bash
pnpm --filter @knowledgestack/api exec prisma migrate deploy --config=prisma.config.ts
```

Create and apply a development migration after a schema change:

```bash
pnpm --filter @knowledgestack/api exec prisma migrate dev --name add_document --config=prisma.config.ts
```

Use `migrate dev` only with a development database. The command can reset the database after an incompatible schema change.

Inspect the generated SQL before you use the migration outside development.
