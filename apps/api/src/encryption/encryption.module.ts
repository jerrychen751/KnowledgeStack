/**
 * This module owns the one cipher that protects every secret this API stores in Postgres.
 *
 * AuthModule encrypts the OAuth tokens of a source credential through it. Every module that stores a secret
 * reads the same key, so one rotated key makes every stored secret unreadable at once.
 */

import { Module } from "@nestjs/common";

import { AppConfigModule } from "../config/app-config.module.js";

import { EncryptionService } from "./encryption.service.js";

@Module({
  imports: [AppConfigModule],
  providers: [EncryptionService],
  exports: [EncryptionService],
})
export class EncryptionModule {}
