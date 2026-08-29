import { Injectable, NotFoundException } from "@nestjs/common";
import { randomInt } from "node:crypto";

import type { Workspace } from "@knowledgestack/api-contract/workspaces";

import { PrismaService } from "../prisma/prisma.service.js";

// Excludes I, L, O, 0 and 1, which a person who reads a code aloud confuses.
const joinCodeAlphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

@Injectable()
export class WorkspacesService {
  constructor(private readonly prisma: PrismaService) {}

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
    const workspace = await this.prisma.workspace.findUnique({
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

    await this.prisma.workspaceMembership.upsert({
      where: { workspaceId_userId: { workspaceId: workspace.id, userId } },
      create: { workspaceId: workspace.id, userId },
      update: {},
    });

    return workspace;
  }

  async isMember(userId: string, workspaceId: string): Promise<boolean> {
    const membership = await this.prisma.workspaceMembership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { id: true },
    });

    return membership !== null;
  }
}
