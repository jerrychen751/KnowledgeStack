import { Injectable, NotFoundException } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";

import type { McpToken } from "@knowledgestack/api-contract/mcp-tokens";

import { PrismaService } from "../prisma/prisma.service.js";

type McpTokenRow = {
  id: string;
  name: string;
  expiresAt: Date;
  lastUsedAt: Date | null;
  createdAt: Date;
};

/** The MCP token behind one request, read through the membership that owns it. */
export type ResolvedMcpToken = {
  mcpTokenId: string;
  userId: string;
  workspaceId: string;
};

@Injectable()
export class McpTokenService {
  constructor(private readonly prisma: PrismaService) {}

  private hashSecret(secret: string): string {
    return createHash("sha256").update(secret).digest("base64url");
  }

  private describeMcpToken(mcpToken: McpTokenRow): McpToken {
    return {
      id: mcpToken.id,
      name: mcpToken.name,
      expiresAt: mcpToken.expiresAt.toISOString(),
      lastUsedAt: mcpToken.lastUsedAt === null ? null : mcpToken.lastUsedAt.toISOString(),
      createdAt: mcpToken.createdAt.toISOString(),
    };
  }

  async listMcpTokens(workspaceId: string, userId: string): Promise<McpToken[]> {
    const mcpTokens = await this.prisma.mcpToken.findMany({
      where: { membership: { workspaceId, userId } },
      orderBy: { createdAt: "desc" },
    });

    return mcpTokens.map((mcpToken) => this.describeMcpToken(mcpToken));
  }

  /**
   * Mint one token and return the secret the client sends.
   *
   * The row hangs off the membership, so leaving the workspace deletes it and a later rejoin authorizes
   * nothing this token issued. Postgres stores only the SHA-256, so a database dump authorizes nothing and
   * no later read can return the secret. The caller hands it to the person once and then drops it.
   */
  async createMcpToken(
    workspaceId: string,
    userId: string,
    name: string,
  ): Promise<{ mcpToken: McpToken; secret: string }> {
    const membership = await this.prisma.workspaceMembership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { id: true },
    });
    if (membership === null) {
      throw new NotFoundException("You are not a member of this workspace.");
    }

    const secret = `ks_mcp_${randomBytes(32).toString("base64url")}`;
    const mcpToken = await this.prisma.mcpToken.create({
      data: {
        name,
        hash: this.hashSecret(secret),
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        membershipId: membership.id,
      },
    });

    return { mcpToken: this.describeMcpToken(mcpToken), secret };
  }

  /** Revoke one token of this person in this workspace. A token another person made matches no row and deletes nothing. */
  async deleteMcpToken(workspaceId: string, userId: string, mcpTokenId: string): Promise<void> {
    await this.prisma.mcpToken.deleteMany({
      where: { id: mcpTokenId, membership: { workspaceId, userId } },
    });
  }

  /**
   * Return the token a secret names, or null when no live row matches. An expired row is deleted here.
   *
   * The membership carries the workspace, and Postgres deletes every token of a membership it removes, so a
   * row that reads back always belongs to a person who still belongs to that workspace. A call that resolves
   * stamps `lastUsedAt`.
   */
  async findMcpToken(secret: string): Promise<ResolvedMcpToken | null> {
    const mcpToken = await this.prisma.mcpToken.findUnique({
      where: { hash: this.hashSecret(secret) },
      select: {
        id: true,
        expiresAt: true,
        membership: { select: { userId: true, workspaceId: true } },
      },
    });
    if (mcpToken === null) {
      return null;
    }
    if (mcpToken.expiresAt.getTime() <= Date.now()) {
      await this.prisma.mcpToken.deleteMany({ where: { id: mcpToken.id } });
      return null;
    }

    // updateMany, because a revoke can delete this row between the read above and this write.
    await this.prisma.mcpToken.updateMany({
      where: { id: mcpToken.id },
      data: { lastUsedAt: new Date() },
    });

    return {
      mcpTokenId: mcpToken.id,
      userId: mcpToken.membership.userId,
      workspaceId: mcpToken.membership.workspaceId,
    };
  }
}
