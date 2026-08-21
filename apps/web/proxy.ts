import { NextResponse, type NextRequest } from "next/server";

/**
 * Send a browser that carries no session cookie to the sign-in page.
 *
 * This function reads the cookie and calls no API, so a cookie that names an expired session still reaches
 * a page. That page reads 401 from /api/auth/session and sends the browser here itself.
 */
export default function proxy(request: NextRequest): NextResponse {
  // auth/auth.controller.ts in the API sets this cookie when Google returns the browser.
  if (request.cookies.has("ks_session")) {
    return NextResponse.next();
  }

  return NextResponse.redirect(new URL("/signin", request.url));
}

export const config = {
  // /api forwards to the API, which runs its own guard. /signin and /health must answer without a session.
  matcher: ["/((?!api|signin|health|_next).*)"],
};
