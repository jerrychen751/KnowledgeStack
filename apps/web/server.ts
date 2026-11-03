import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from "@angular/ssr/node";
import express, { type NextFunction, type Request, type Response } from "express";

// This server forwards /api/... requests (with at least 1 subsequent segment) to the backend API
// This way the backend API can stay entirely private / unreachable from browsers

// Normally due to CORS browsers block responses from a different origin (scheme + host + port) to prevent malicious websites from receiving data after sending request to different origin using browser cookies
// Here we bypass CORS because this server sends a request to the backend API which is on localhost (opens TCP connection to port 3001)

/**
 * Forwards requests made by application frontend to backend API. Utilizes a denylist to selectively leave out forwarding some headers.
 */
async function forwardRequest(request: Request, response: Response): Promise<void> {
  const apiUrl = process.env["API_INTERNAL_URL"];
  if (!apiUrl) {
    throw new Error("API_INTERNAL_URL is required.");
  }

  // These describe the browser's connection to this server. fetch writes its own for the connection to the API, and throws on some of them.
  const requestHeaders = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (value !== undefined) {
      requestHeaders.set(name, Array.isArray(value) ? value.join(", ") : value);
    }
  }
  for (const name of ["connection", "keep-alive", "transfer-encoding", "upgrade", "expect", "content-length", "accept-encoding"]) {
    requestHeaders.delete(name);
  }

  // TypeScript's fetch types do not list duplex, which Node requires for a streamed request body.
  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const init: RequestInit & { duplex: "half" } = {
    method: request.method,
    headers: requestHeaders,
    body: hasBody ? (Readable.toWeb(request) as ReadableStream<Uint8Array>) : undefined,
    duplex: "half",
    redirect: "manual",
    cache: "no-store",
  };

  // originalUrl keeps the path as the browser encoded it and the query string, so only the /api prefix comes off.
  const path = request.originalUrl.slice("/api".length);
  let upstream: globalThis.Response;
  try {
    upstream = await fetch(`${apiUrl}${path}`, init);
  } catch {
    response.status(502).json({ message: `The API at ${apiUrl} did not answer. Start it with pnpm dev.` });
    return;
  }

  // fetch already decompressed the body, so the encoding and the length the API sent no longer describe it.
  const skipped = new Set(["content-encoding", "content-length", "transfer-encoding", "connection", "keep-alive", "set-cookie"]);
  for (const [name, value] of upstream.headers) {
    if (!skipped.has(name)) {
      response.setHeader(name, value);
    }
  }
  // Headers joins repeated headers into one line, which breaks Set-Cookie, so each cookie is copied on its own.
  const cookies = upstream.headers.getSetCookie();
  if (cookies.length > 0) {
    response.setHeader("Set-Cookie", cookies);
  }
  response.setHeader("Cache-Control", "no-cache, no-transform");
  response.status(upstream.status);

  // The chat answer arrives as Server-Sent Events, so the body streams through instead of being read here.
  if (upstream.body === null) {
    response.end();
    return;
  }
  response.flushHeaders();
  // pipeline ends the browser's response when the API drops mid-answer, and cancels the API request when the
  // browser leaves, so the API's close handler stops the agent. A plain pipe does neither.
  const body = Readable.fromWeb(upstream.body as import("node:stream/web").ReadableStream<Uint8Array>);
  await pipeline(body, response).catch(() => undefined);
}

const app = express();
// Page requests must name a host in angular.json security.allowedHosts or in NG_ALLOWED_HOSTS; any other host answers 400.
const angularApp = new AngularNodeAppEngine();

app.get("/health", (_request, response) => {
  response.json({ status: "ok" });
});

app.get("/api/*path", forwardRequest);
app.post("/api/*path", forwardRequest);
app.delete("/api/*path", forwardRequest);

app.use(express.static(join(import.meta.dirname, "../browser"), { maxAge: "1y", index: false, redirect: false }));

/**
 * Send a browser that carries no session cookie to the sign-in page.
 *
 * This function reads the cookie and calls no API, so a cookie that names an expired session still reaches
 * a page. That page reads 401 from /api/auth/session and sends the browser here itself.
 */
function redirectWithoutSession(request: Request, response: Response, next: NextFunction): void {
  // /api forwards to the API, which runs its own guard. /signin and /health must answer without a session.
  // Static files are answered above, so only page requests reach this check.
  // auth/auth.controller.ts in the API sets this cookie when Google returns the browser.
  const hasSession = /(?:^|;\s*)ks_session=/.test(request.headers.cookie ?? "");
  if (hasSession || /^\/(api|signin|health)/.test(request.path)) {
    next();
    return;
  }

  // A relative Location makes the browser resolve the page against the public address, not the address this server listens on.
  response.redirect(307, "/signin");
}

app.use(redirectWithoutSession);

app.use((request, response, next) => {
  angularApp
    .handle(request)
    .then((result) => (result ? writeResponseToNodeResponse(result, response) : next()))
    .catch(next);
});

if (isMainModule(import.meta.url)) {
  const port = Number(process.env["PORT"] ?? 3000);
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }
    console.log(`The web server listens on port ${port}.`);
  });
}

// The Angular dev server and build tooling load this handler instead of starting the listener above.
export const reqHandler = createNodeRequestHandler(app);
