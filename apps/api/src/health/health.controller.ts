import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";

import type { StatusResponse } from "@knowledgestack/shared/http";

import { PrismaService } from "../database/prisma.service.js";

import { Public } from "../auth/public.decorator.js";

// The container healthcheck and the CI job call both routes without a session cookie.
@Public()
@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("live")
  checkLiveness(): StatusResponse {
    return { status: "ok" };
  }

  @Get("ready")
  async checkReadiness(): Promise<StatusResponse> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException({
        status: "unavailable",
      });
    }

    return { status: "ok" };
  }
}
