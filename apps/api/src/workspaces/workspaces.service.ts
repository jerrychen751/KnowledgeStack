import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { randomInt } from "node:crypto";

import type { Workspace } from "@knowledgestack/api-contract/workspaces";

import { DatabaseConnectionPool } from "../database-connections/database-connection.pool.js";
import { PrismaService } from "../prisma/prisma.service.js";

// Excludes I, L, O, 0 and 1, which a person who reads a code aloud confuses.
const joinCodeAlphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

@Injectable()
export class WorkspacesService {
  constructor(
    private readonly databaseConnectionPool: DatabaseConnectionPool,
    private readonly prisma: PrismaService,
  ) {}

  private async createSlug(name: string): Promise<string> {
    const baseSlug =
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40) || "workspace";
    const takenSlugs = new Set(
      (
        await this.prisma.workspace.findMany({
          where: { slug: { startsWith: baseSlug } },
          select: { slug: true },
        })
      ).map((workspace) => workspace.slug),
    );
    if (!takenSlugs.has(baseSlug)) {
      return baseSlug;
    }

    for (let suffix = 2; ; suffix += 1) {
      const slug = `${baseSlug}-${suffix}`;
      if (!takenSlugs.has(slug)) {
        return slug;
      }
    }
  }

  /** Return every workspace the person belongs to, oldest membership first. */
  async listWorkspaces(userId: string): Promise<Workspace[]> {
    const memberships = await this.prisma.workspaceMembership.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      select: {
        createdAt: true,
        workspace: {
          select: {
            id: true,
            joinCode: true,
            name: true,
            _count: { select: { memberships: true, sources: true } },
          },
        },
      },
    });

    return memberships.map((membership) => ({
      id: membership.workspace.id,
      name: membership.workspace.name,
      joinCode: membership.workspace.joinCode,
      memberCount: membership.workspace._count.memberships,
      sourceCount: membership.workspace._count.sources,
      joinedAt: membership.createdAt.toISOString(),
    }));
  }

  /**
   * Create a workspace and make the person its first member.
   *
   * The slug takes a numeric suffix when the name repeats a stored one, because that column stays unique.
   */
  async createWorkspace(userId: string, name: string) {
    return this.prisma.workspace.create({
      data: {
        name,
        slug: await this.createSlug(name),
        // randomInt draws evenly. A random byte taken modulo 31 would favour the first characters of the alphabet.
        joinCode: Array.from(
          { length: 8 },
          () => joinCodeAlphabet[randomInt(joinCodeAlphabet.length)],
        ).join(""),
        memberships: { create: { userId } },
      },
      select: { id: true, joinCode: true, name: true },
    });
  }

  /** Add the person to the workspace that carries the code. A member who types it again keeps one membership. */
  async joinWorkspace(userId: string, code: string) {
    return this.prisma.$transaction(async (transaction) => {
      const workspace = await transaction.workspace.findUnique({
        // The stored form holds no separator and no lower case, so "k7qw-2m4d" and "K7QW2M4D" name one workspace.
        where: {
          joinCode: Array.from(code.toUpperCase())
            .filter((character) => joinCodeAlphabet.includes(character))
            .join(""),
        },
        select: { id: true, joinCode: true, name: true },
      });
      if (workspace === null) {
        throw new NotFoundException("No workspace carries that code.");
      }

      const lockedRows = await transaction.$queryRaw<{ id: string }[]>`
        SELECT "id"
        FROM "workspaces"
        WHERE "id" = ${workspace.id}
        FOR KEY SHARE
      `;
      if (lockedRows.length === 0) {
        throw new NotFoundException("No workspace carries that code.");
      }

      await transaction.workspaceMembership.upsert({
        where: { workspaceId_userId: { workspaceId: workspace.id, userId } },
        create: { workspaceId: workspace.id, userId },
        update: {},
      });

      return workspace;
    });
  }

  /**
   * Remove the person from the workspace.
   *
   * Postgres deletes every MCP token that hangs off this membership, so a client the person registered stops
   * answering at once. The chats and the documents stay while another member remains, because they belong to
   * the workspace. Every browser of this person that reads the workspace loses it on the next request, because
   * SessionService.findSession reads the membership again and answers with a null active workspace.
   *
   * The last member to leave deletes the workspace, and Postgres deletes everything it holds.
   */
  async leaveWorkspace(userId: string, workspaceId: string, isLastMember: boolean): Promise<void> {
    const deletedConnectionIds = await this.prisma.$transaction(
      async (transaction) => {
        await transaction.$queryRaw`
          SELECT "id"
          FROM "workspaces"
          WHERE "id" = ${workspaceId}
          FOR UPDATE
        `;
        const removed = await transaction.workspaceMembership.deleteMany({
          where: { workspaceId, userId },
        });
        if (removed.count === 0) {
          throw new NotFoundException("The workspace does not exist.");
        }
        const hasOtherMembers = (await transaction.workspaceMembership.count({ where: { workspaceId } })) > 0;
        // The person confirmed one of two outcomes, so a member count that changed since their page loaded rolls the leave back.
        if (hasOtherMembers === isLastMember) {
          throw new ConflictException(
            isLastMember
              ? "Someone joined this workspace, so leaving no longer deletes it. Leave again to confirm."
              : "You're now the last member, so leaving deletes this workspace and everything in it. Leave again to confirm.",
          );
        }
        if (hasOtherMembers) {
          return [];
        }

        const connections = await transaction.databaseConnection.findMany({
          where: { workspaceId },
          select: { id: true },
        });
        await transaction.workspace.delete({ where: { id: workspaceId } });

        return connections.map((connection) => connection.id);
      },
      { timeout: 30_000 },
    );

    await Promise.all(
      deletedConnectionIds.map((connectionId) => this.databaseConnectionPool.closePool(connectionId)),
    );
  }

  async isMember(userId: string, workspaceId: string): Promise<boolean> {
    const membership = await this.prisma.workspaceMembership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { id: true },
    });

    return membership !== null;
  }
}
