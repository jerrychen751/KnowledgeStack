import { Module } from "@nestjs/common";

import { AppConfig } from "./app-config.js";

/** Export the process configuration provider to each API module that imports this module. */
@Module({
  providers: [AppConfig],
  exports: [AppConfig],
})
export class AppConfigModule {}
