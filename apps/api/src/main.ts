import "dotenv/config";

import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";

// Node ESM needs the runtime .js extension, and TypeScript substitutes it: src/app.module.ts emits dist/app.module.js.
import { AppModule } from "./app.module.js";
import { AppConfig } from "./config/app-config.js";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  const appConfig = app.get(AppConfig);
  app.useLogger([appConfig.logLevel]);
  // An upload request carries the whole text of every file, well past the 100 kB default of the body parser.
  app.useBodyParser("json", { limit: appConfig.requestBodyLimit });
  app.enableShutdownHooks(); // Only after this call does Nest run onModuleDestroy on SIGTERM and SIGINT.
  Logger.log(`Deployment name: ${appConfig.deploymentName}`, "Bootstrap");

  await app.listen(appConfig.port, appConfig.host);
}

await bootstrap();
