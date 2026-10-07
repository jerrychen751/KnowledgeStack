// Next.js App Router convention has a route.ts file whose folder path determines matched URLs (here we only match /api/... with at least 1 subsequent segment)
// We export functions as named HTTP methods which act as handlers for that HTTP request
// This way the backend API can stay entirely private / unreachable from browsers

// Normally due to CORS browsers block responses from a different origin (scheme + host + port) to prevent malicious websites from receiving data after sending request to different origin using browser cookies
// Here we bypass CORS because the Next.js server sends a request to the backend API which is on localhost (opens TCP connection to port 3001)


// Tells Next.js to run handler fresh each request (named export)
export const dynamic = "force-dynamic";


/**
 * Forwards requests made by application frontend to backend API. Utilizes a denylist to selectively leave out forwarding some headers.
 */
async function forwardRequest(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await context.params;
  const apiUrl = process.env.API_INTERNAL_URL;
  if (!apiUrl) {
    throw new Error("API_INTERNAL_URL is required.");
  }

  const search = new URL(request.url).search;
  // These describe the browser's connection to Next.js. fetch writes its own for the connection to the API, and throws on some of them.
  const requestHeaders = new Headers(request.headers);
  for (const name of ["connection", "keep-alive", "transfer-encoding", "upgrade", "expect", "content-length", "accept-encoding"]) {
    requestHeaders.delete(name);
  }

  // TypeScript's fetch types do not list duplex, which Node requires for a streamed request body.
  const init: RequestInit & { duplex: "half" } = {
    method: request.method,
    headers: requestHeaders,
    body: request.body,
    duplex: "half",
    redirect: "manual",
    cache: "no-store",
  };

  let response: Response;
  try {
    response = await fetch(`${apiUrl}/${path.join("/")}${search}`, init);
  } catch {
    return Response.json(
      { message: `The API at ${apiUrl} did not answer. Start it with pnpm dev.` },
      { status: 502 },
    );
  }

  // fetch already decompressed the body, so the encoding and the length the API sent no longer describe it.
  const responseHeaders = new Headers(response.headers);
  for (const name of ["content-encoding", "content-length", "transfer-encoding", "connection", "keep-alive"]) {
    responseHeaders.delete(name);
  }
  responseHeaders.set("Cache-Control", "no-cache, no-transform");

  // The chat answer arrives as Server-Sent Events, so the body streams through instead of being read here.
  return new Response(response.body, { status: response.status, headers: responseHeaders });
}

export const GET = forwardRequest;
export const POST = forwardRequest;
export const DELETE = forwardRequest;
