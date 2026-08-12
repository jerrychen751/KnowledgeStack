import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module.js";

import { OAuthRegistry } from "./oauth.registry.js";
import { TokenService } from "./token.service.js";

@Module({
  imports: [DatabaseModule],
  providers: [OAuthRegistry, TokenService],
  exports: [OAuthRegistry, TokenService],
})
export class AuthModule {}

// SyncModule imports this module and AppModule imports SyncModule, so Nest constructs TokenService at
// boot. Every environment that starts the API must set TOKEN_ENCRYPTION_KEY or the process exits.
