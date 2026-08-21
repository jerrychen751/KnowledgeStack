import { createParamDecorator, type ExecutionContext, ForbiddenException } from "@nestjs/common";

import type { RequestSession } from "./session.service.js";

/** The signed-in browser. SessionGuard rejects the request before a route that reads this parameter runs. */
export const CurrentSession = createParamDecorator(
  (_data: unknown, context: ExecutionContext): RequestSession =>
    context.switchToHttp().getRequest<{ session: RequestSession }>().session,
);

/**
 * The workspace this browser reads.
 *
 * A person who belongs to no workspace, or who left the one they read, gets 403. The web app answers that
 * status by opening /workspaces.
 */
export const ActiveWorkspaceId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const { session } = context.switchToHttp().getRequest<{ session: RequestSession }>();
    if (session.activeWorkspaceId === null) {
      throw new ForbiddenException("Open a workspace before you read its documents.");
    }

    return session.activeWorkspaceId;
  },
);
