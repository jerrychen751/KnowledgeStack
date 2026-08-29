import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";

import { AppConfigModule } from "../config/app-config.module.js";
import { EncryptionModule } from "../encryption/encryption.module.js";
import { PrismaModule } from "../prisma/prisma.module.js";

import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { OAuthRegistry } from "./oauth.registry.js";
import { SessionGuard } from "./session.guard.js";
import { SessionService } from "./session.service.js";
import { TokenService } from "./token.service.js";

@Module({
  imports: [AppConfigModule, EncryptionModule, PrismaModule],
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

// AppModule imports AppConfigModule directly, so Nest constructs AppConfig at boot. Every environment that starts the API must set TOKEN_ENCRYPTION_KEY or the process exits.
