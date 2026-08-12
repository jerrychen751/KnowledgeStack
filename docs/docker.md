Docker packages an application and its dependencies into an image. Docker uses the image to create a container on each host.

Docker has two main objects:

- An image contains the application files, dependencies, and process instructions.
- A container runs one process from an image in an isolated file system and network space.

This project uses Docker in two ways:

- Docker runs PostgreSQL with one version, database, user, and port on each developer computer.
- Docker packages each application so a compatible host can run the same image.

## Local paths

Complete the [local setup](../README.md#local-development) before you use either path.

The native path uses Docker for both databases. Nest and Next.js run on the host.

```bash
pnpm dev:db
pnpm --filter @knowledgestack/api exec prisma generate --config=prisma.config.ts
pnpm --filter @knowledgestack/api exec prisma migrate deploy --config=prisma.config.ts
pnpm dev
```

`pnpm dev` is an alias for `pnpm dev:apps`.

The full container path uses Docker for every service.

```bash
pnpm dev:full
```

The `full` Compose profile contains `api-migrate`, `api`, and `web`.
The database services do not use a profile.

## Service addresses

| Source | Target | Address |
|---|---|---|
| Native web app | Native API | `127.0.0.1:3001` |
| Native API | App database | `127.0.0.1:5432` |
| Native API | Tenant database | `127.0.0.1:5433` |
| Web container | API container | `api:3001` |
| API container | App database | `app-db:5432` |
| API container | Tenant database | `tenant-db:5432` |

The address `127.0.0.1` refers to the current host or container. A container uses a Compose service name to reach another container.

## Environment files

The root `.env` contains local values for shared infrastructure. Compose reads this file for variable substitution.

`apps/api/.env` contains API-only values. `apps/web/.env.local` contains web-only values.

The native database URLs must use the root database credentials and the host `127.0.0.1`.
Set `API_INTERNAL_URL` to `http://127.0.0.1:3001` for the native web app.

For a container, an `environment` value overrides the same value from `env_file`.
Do not copy a live environment file into an image. The root `.dockerignore` excludes every live environment file.

## Image builds

Each Dockerfile uses the repository root as its build context. Both applications depend on the shared workspace package.

The API image generates the Prisma client before it compiles the API. The final image contains only production dependencies and compiled files.

The web image uses the Next.js standalone output. The final image contains the traced runtime files and static assets.

The final images use the non-root `node` user.

## Data and shutdown

This command stops the services and keeps both database volumes:

```bash
pnpm docker:down
```

Do not add `--volumes` unless you intend to delete all local database data.

Compose defines the local system. A production platform must supply its own secrets, ports, restart policy, storage, and external service addresses.
