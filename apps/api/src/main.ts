/**
 * Creates Nest application and starts the server as entrypoint.
 */

// "type" in package.json specifies whether Node.js treats files as ECMAScript modules (ES Modules) or CommonJS modules
// Node ESM requires a runtime .js file extensions
// TypeScript uses extension substitution; we don't expect app.module.js to exist in src/

// Nest API gets transpiled into JS, and since no bundler is specified TypeScript emits separate JS modules
// Node executes dist/main.js

import "dotenv/config";

import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module.js";

async function startApplication(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks(); // Nest uses this for system signal hooks (e.g., onModuleDestroy())
  const port = Number(process.env.PORT || "3001");

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be an integer from 1 through 65535.");
  }

  await app.listen(port, process.env.HOST || "127.0.0.1");
}

await startApplication();
