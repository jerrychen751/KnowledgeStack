import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  Req,
  Res,
  ServiceUnavailableException,
} from "@nestjs/common";

import type { FindAccountResponse, StartSignInResponse } from "@knowledgestack/shared/auth";
import type { StatusResponse } from "@knowledgestack/shared/http";

import { AppConfig } from "../config/app-config.js";

import { AuthService } from "./auth.service.js";
import { Public } from "./public.decorator.js";
import { CurrentSession } from "./session.decorator.js";
import {
  SESSION_COOKIE_NAME,
  SessionService,
  readCookie,
  type RequestSession,
} from "./session.service.js";

// The Express response, narrowed to the calls this controller makes. @types/express is not a dependency.
type CookieResponse = {
  clearCookie(name: string, options: Record<string, unknown>): void;
  cookie(name: string, value: string, options: Record<string, unknown>): void;
  json(body: unknown): void;
  redirect(url: string): void;
};

// The Express request, narrowed to the header this controller reads.
type CookieRequest = {
  headers: { cookie?: string };
};

// Carries the OAuth state to the browser that starts the sign-in, so only that browser can finish it.
const OAUTH_STATE_COOKIE_NAME = "ks_oauth_state";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly appConfig: AppConfig,
    private readonly sessionService: SessionService,
  ) {}

  private buildCookieOptions(): Record<string, unknown> {
    return {
      httpOnly: true,
      path: "/",
      // lax lets the cookie ride the redirect back from Google and keeps it off a cross-site POST.
      sameSite: "lax",
      secure: this.appConfig.webAppUrl.startsWith("https://"),
    };
  }

  /**
   * Return the Google URL where the person picks an account. The browser leaves the app to open it.
   *
   * The state cookie rides along, and the callback accepts no code without it, so a sign-in started in one
   * browser cannot be finished in another.
   */
  @Public()
  @Get("google")
  startSignIn(@Res() response: CookieResponse): void {
    let signIn: ReturnType<AuthService["startSignIn"]>;
    try {
      signIn = this.authService.startSignIn();
    } catch (error) {
      // readClientOptions throws when the deployment configured no Google client, and its message names the GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET that is absent. Nest hides the message of any error that is not an HttpException.
      throw new ServiceUnavailableException(
        error instanceof Error ? error.message : "Google sign-in is not configured.",
      );
    }

    response.cookie(OAUTH_STATE_COOKIE_NAME, signIn.state, {
      ...this.buildCookieOptions(),
      expires: new Date(Date.now() + 10 * 60 * 1000),
    });
    response.json({ authorizeUrl: signIn.authorizeUrl } satisfies StartSignInResponse);
  }

  /**
   * Finish the sign-in Google redirected back to, set the session cookie, and return the browser to the web app.
   *
   * The Google credentials console must hold the web app path that forwards to this route as an authorized
   * redirect URI, such as http://localhost:3000/api/auth/google/callback. The browser then sets the cookie on
   * the web app origin, so WEB_APP_URL and the registered redirect URI must name one host.
   */
  @Public()
  @Get("google/callback")
  async completeSignIn(
    @Query("code") code: string | undefined,
    @Query("state") state: string | undefined,
    @Query("error") error: string | undefined,
    @Req() request: CookieRequest,
    @Res() response: CookieResponse,
  ): Promise<void> {
    const startedState = readCookie(request.headers.cookie, OAUTH_STATE_COOKIE_NAME);
    response.clearCookie(OAUTH_STATE_COOKIE_NAME, this.buildCookieOptions());

    if (error !== undefined) {
      response.redirect(
        `${this.appConfig.webAppUrl}/signin?error=${encodeURIComponent(error)}`,
      );
      return;
    }
    if (code === undefined || state === undefined) {
      throw new BadRequestException("The callback needs a code and a state value.");
    }
    if (startedState === undefined || startedState !== state) {
      response.redirect(
        `${this.appConfig.webAppUrl}/signin?error=${encodeURIComponent(
          "This browser did not start the sign-in. Try again.",
        )}`,
      );
      return;
    }

    let signIn: Awaited<ReturnType<AuthService["completeSignIn"]>>;
    try {
      signIn = await this.authService.completeSignIn(code);
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : "The sign-in failed.";
      response.redirect(
        `${this.appConfig.webAppUrl}/signin?error=${encodeURIComponent(message)}`,
      );
      return;
    }

    response.cookie(SESSION_COOKIE_NAME, signIn.token, {
      ...this.buildCookieOptions(),
      expires: signIn.expiresAt,
    });
    response.redirect(
      signIn.activeWorkspaceId === null
        ? `${this.appConfig.webAppUrl}/workspaces`
        : this.appConfig.webAppUrl,
    );
  }

  /** Return the signed-in account. A browser without a live session gets 401 and opens /signin. */
  @Get("session")
  async findAccount(@CurrentSession() session: RequestSession): Promise<FindAccountResponse> {
    return this.authService.findAccount(session);
  }

  /** Delete the session row and clear the cookie. Every other browser of the same person stays signed in. */
  @Post("signout")
  @HttpCode(200)
  async deleteSession(
    @CurrentSession() session: RequestSession,
    @Res() response: CookieResponse,
  ): Promise<void> {
    await this.sessionService.deleteSession(session.sessionId);
    response.clearCookie(SESSION_COOKIE_NAME, this.buildCookieOptions());
    response.json({ status: "ok" } satisfies StatusResponse);
  }
}
