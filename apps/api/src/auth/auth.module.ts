import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";

import { AppConfigModule } from "../config/app-config.module.js";
import { PrismaModule } from "../prisma/prisma.module.js";

import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { OAuthRegistry } from "./oauth.registry.js";
import { SessionGuard } from "./session.guard.js";
import { SessionService } from "./session.service.js";
import { TokenService } from "./token.service.js";

@Module({
  imports: [AppConfigModule, PrismaModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    OAuthRegistry,
    SessionService,
    TokenService,
    // APP_GUARD registers SessionGuard for every route of every module, so a new controller is closed until it carries @Public().
    { provide: APP_GUARD, useClass: SessionGuard },
  ],
  exports: [OAuthRegistry, SessionService, TokenService],
})
export class AuthModule {}

// SyncModule imports this module and AppModule imports SyncModule, so Nest constructs TokenService at boot. Every environment that starts the API must set TOKEN_ENCRYPTION_KEY or the process exits.
