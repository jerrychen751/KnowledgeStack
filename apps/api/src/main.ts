import "dotenv/config";

import { NestFactory } from "@nestjs/core";

// Node ESM needs the runtime .js extension, and TypeScript substitutes it: src/app.module.ts emits dist/app.module.js.
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
