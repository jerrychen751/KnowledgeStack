import { Injectable } from "@nestjs/common";
import { randomBytes } from "node:crypto";

import type { FindAccountResponse } from "@knowledgestack/api-contract/auth";

import { AppConfig } from "../config/app-config.js";
import { PrismaService } from "../prisma/prisma.service.js";

import { GoogleOAuthClient } from "./google.oauth.js";
import { readClientOptions } from "./oauth.registry.js";
import { SessionService, type RequestSession } from "./session.service.js";

@Injectable()
export class AuthService {
  constructor(
    private readonly appConfig: AppConfig,
    private readonly prisma: PrismaService,
    private readonly sessionService: SessionService,
  ) {}

  /** Build the client on demand, so an API without the Google variables still starts and serves its other routes. */
  private createClient(): GoogleOAuthClient {
    return new GoogleOAuthClient(
      readClientOptions("GOOGLE", this.appConfig.googleRedirectUri),
    );
  }

  /**
   * Return the Google URL where the person picks an account, and the state value that URL carries.
   *
   * The caller must write the state into a cookie on the browser that starts the sign-in, and must reject a
   * callback whose state does not match that cookie. A state the API alone remembers proves nothing: any
   * browser could then present a code and a state that another browser started, and receive the session.
   *
   * The client is built before the state is minted, so a deployment without the Google variables throws
   * here and hands out nothing.
   */
  startSignIn(): { authorizeUrl: string; state: string } {
    const client = this.createClient();
    const state = randomBytes(24).toString("base64url");

    return { authorizeUrl: client.buildAuthorizationUrl(state).toString(), state };
  }

  /**
   * Exchange the authorization code, store the account, and open a session.
   *
   * A second sign-in updates the stored name, address and picture, because Google owns those values. The
   * session opens on the workspace the person joined last, and on none when they belong to none.
   */
  async completeSignIn(
    code: string,
  ): Promise<{ activeWorkspaceId: string | null; expiresAt: Date; token: string }> {
    const identity = await this.createClient().exchangeAuthorizationCode(code);
    const user = await this.prisma.user.upsert({
      where: { externalId: identity.externalId },
      create: identity,
      update: {
        externalDisplayName: identity.externalDisplayName,
        externalEmail: identity.externalEmail,
        externalImageUrl: identity.externalImageUrl,
      },
      select: {
        id: true,
        memberships: {
          orderBy: { createdAt: "desc" },
          select: { workspaceId: true },
          take: 1,
        },
      },
    });

    const activeWorkspaceId = user.memberships[0]?.workspaceId ?? null;
    const { expiresAt, token } = await this.sessionService.createSession(
      user.id,
      activeWorkspaceId,
    );

    return { activeWorkspaceId, expiresAt, token };
  }

  /** Return the signed-in account and the workspace the browser reads, which the web app shows in the header. */
  async findAccount(session: RequestSession): Promise<FindAccountResponse> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: session.userId },
      select: {
        externalDisplayName: true,
        externalEmail: true,
        externalImageUrl: true,
        id: true,
      },
    });
    const activeWorkspace =
      session.activeWorkspaceId === null
        ? null
        : await this.prisma.workspace.findUnique({
            where: { id: session.activeWorkspaceId },
            select: { id: true, name: true },
          });

    return { activeWorkspace, user };
  }
}
