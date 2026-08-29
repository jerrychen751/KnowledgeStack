import { Module } from "@nestjs/common";

import { PrismaService } from "./prisma.service.js";

@Module({
  providers: [PrismaService],
  exports: [PrismaService], // enables PrismaService to be used by another module; otherwise only controllers/providers declared in PrismaModule can inject PrismaService
})
export class PrismaModule {}

// This module is then imported by another module that needs DB access
// When this module is imported, declared exports are exported and can be used if declared in constructor
