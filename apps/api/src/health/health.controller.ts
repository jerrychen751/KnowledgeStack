import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service.js";

@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Return whether the backend API is reachable via an HTTP request.
   */
  @Get("live")
  getHealth(): { status: "ok" } {
    return { status: "ok" };
  }

  /** Return the API readiness state after an app-db query. */
  @Get("ready")
  async getReady(): Promise<{ status: "ok" }> {
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
