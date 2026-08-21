import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { IS_PUBLIC_ROUTE } from "./public.decorator.js";
import {
  SESSION_COOKIE_NAME,
  SessionService,
  readCookie,
  type RequestSession,
} from "./session.service.js";

type SessionRequest = {
  headers: { cookie?: string };
  session?: RequestSession;
};

/**
 * Resolve the session cookie on every request, then reject the request when the route needs a signed-in
 * person and the cookie names no live session. AuthModule registers this guard under APP_GUARD, so a new
 * controller is closed until it carries @Public().
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessionService: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<SessionRequest>();
    // Express parses no cookies without cookie-parser, which is not a dependency.
    const token = readCookie(request.headers.cookie, SESSION_COOKIE_NAME);
    if (token !== undefined) {
      const session = await this.sessionService.findSession(token);
      if (session !== null) {
        request.session = session;
      }
    }

    const isPublicRoute = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_ROUTE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublicRoute === true) {
      return true;
    }
    if (request.session === undefined) {
      throw new UnauthorizedException("Sign in with Google before you call this route.");
    }

    return true;
  }
}
