// The browser never reaches the API directly. Next.js forwards every /api request, so the API needs no CORS rules and stays private to the Docker network in a deployment.
export const dynamic = "force-dynamic";

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
  // The API resolves the signed-in person from this cookie, so the proxy passes it through unread.
  const cookie = request.headers.get("cookie");
  const body =
    request.method === "GET" || request.method === "HEAD"
      ? undefined
      : await request.text();

  let response: Response;
  try {
    response = await fetch(`${apiUrl}/${path.join("/")}${search}`, {
      method: request.method,
      headers: {
        "Content-Type": "application/json",
        ...(cookie === null ? {} : { cookie }),
      },
      body,
      redirect: "manual",
      cache: "no-store",
    });
  } catch {
    return Response.json(
      { message: `The API at ${apiUrl} did not answer. Start it with pnpm dev.` },
      { status: 502 },
    );
  }

  const headers = new Headers({
    "Content-Type": response.headers.get("Content-Type") ?? "application/json",
    "Cache-Control": "no-cache, no-transform",
  });
  // Only the browser can drop the session cookie that /auth/signout clears.
  for (const setCookie of response.headers.getSetCookie()) {
    headers.append("Set-Cookie", setCookie);
  }

  // The chat answer arrives as Server-Sent Events, so the body streams through instead of being read here.
  return new Response(response.body, { status: response.status, headers });
}

export const GET = forwardRequest;
export const POST = forwardRequest;
export const DELETE = forwardRequest;
