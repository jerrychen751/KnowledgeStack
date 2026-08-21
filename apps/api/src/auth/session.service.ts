import { Injectable } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";

import { PrismaService } from "../database/prisma.service.js";

/** The cookie that carries the session token. The guard reads it and the auth controller writes it. */
export const SESSION_COOKIE_NAME = "ks_session";

/**
 * Return one cookie value from a raw Cookie header.
 *
 * Returns undefined when the header carries no such cookie, and also when the value holds a broken percent
 * escape such as "%" or "%zz", because that value names nothing a caller can use.
 */
export function readCookie(header: string | undefined, name: string): string | undefined {
  const entry = (header ?? "")
    .split(";")
    .find((part) => part.trimStart().startsWith(`${name}=`));
  if (entry === undefined) {
    return undefined;
  }

  try {
    return decodeURIComponent(entry.slice(entry.indexOf("=") + 1).trim());
  } catch {
    return undefined;
  }
}

/** The signed-in browser behind one request. SessionGuard attaches it to the request object. */
export type RequestSession = {
  activeWorkspaceId: string | null;
  sessionId: string;
  userId: string;
};

@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService) {}

  private hashToken(token: string): string {
    return createHash("sha256").update(token).digest("base64url");
  }

  /**
   * Open a session and return the token the cookie carries.
   *
   * Postgres stores only the SHA-256 of the token, so a database dump signs nobody in. The plaintext token
   * exists in the cookie alone, and no log may hold it.
   */
  async createSession(
    userId: string,
    activeWorkspaceId: string | null,
  ): Promise<{ token: string; expiresAt: Date }> {
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await this.prisma.userSession.create({
      data: { activeWorkspaceId, expiresAt, tokenHash: this.hashToken(token), userId },
    });

    return { token, expiresAt };
  }

  /**
   * Return the session a cookie token names, or null when no row matches. An expired row is deleted here.
   *
   * The active workspace reads back as null once the membership behind it is gone, so no request reaches a
   * workspace the person left.
   */
  async findSession(token: string): Promise<RequestSession | null> {
    const session = await this.prisma.userSession.findUnique({
      where: { tokenHash: this.hashToken(token) },
      select: { activeWorkspaceId: true, expiresAt: true, id: true, userId: true },
    });
    if (session === null) {
      return null;
    }
    if (session.expiresAt.getTime() <= Date.now()) {
      await this.prisma.userSession.deleteMany({ where: { id: session.id } });
      return null;
    }

    const membership =
      session.activeWorkspaceId === null
        ? null
        : await this.prisma.workspaceMembership.findUnique({
            where: {
              workspaceId_userId: {
                workspaceId: session.activeWorkspaceId,
                userId: session.userId,
              },
            },
            select: { workspaceId: true },
          });

    return {
      activeWorkspaceId: membership?.workspaceId ?? null,
      sessionId: session.id,
      userId: session.userId,
    };
  }

  /** Point this browser at one workspace. The caller checks the membership first. */
  async selectWorkspace(sessionId: string, workspaceId: string): Promise<void> {
    await this.prisma.userSession.update({
      where: { id: sessionId },
      data: { activeWorkspaceId: workspaceId },
    });
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.prisma.userSession.deleteMany({ where: { id: sessionId } });
  }
}
