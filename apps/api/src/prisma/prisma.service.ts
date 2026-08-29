import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../generated/prisma/client.js";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    const connectionString = process.env.DB_POOL_URL;
    if (!connectionString) {
      throw new Error("DB_POOL_URL is not set in the environment");
    }

    const adapter = new PrismaPg({ connectionString: connectionString });
    super({
      adapter,
      omit: {
        sourceCredential: {
          encryptedAccessToken: true,
          encryptedRefreshToken: true,
        },
      },
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
