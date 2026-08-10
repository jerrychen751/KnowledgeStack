/**
 *
 * Usage:
 *  - `pnpm exec prisma migrate dev --name <migration-name>`
 */

import "dotenv/config";

import { defineConfig, env } from "prisma/config";

export default defineConfig({
  // Paths are relative to this config file's location
  schema: "prisma/schema",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DB_DIRECT_URL"),
  },
});
