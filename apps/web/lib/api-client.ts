"use client";

import type { ErrorResponse } from "@knowledgestack/shared/http";

/** The API refused the request. `status` is the HTTP status, and `message` is the text the API wrote, the raw body when that text does not parse as JSON, or a fallback that names the status. */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** The browser is leaving for another page, so the request never finishes. Catch it and report nothing, because the page that would show the message unloads. */
export class RedirectError extends Error {
  constructor(destination: string) {
    super(`The browser is leaving for ${destination}.`);
    this.name = "RedirectError";
  }
}

/** Send a request to the API through the /api proxy and return the answer. Throw `RedirectError` after this function sends a browser with no session to /signin, or a browser with no open workspace to /workspaces. Throw `ApiError` on every other status the API refuses, and on a 401 or a 403 that arrives at the page it would redirect to. */
export async function sendRequest(path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(path, init);
  if (response.ok) {
    return response;
  }

  // 403 means the session opened no workspace, and /workspaces is where the person picks one.
  const destination =
    response.status === 401 ? "/signin" : response.status === 403 ? "/workspaces" : null;
  if (destination !== null && window.location.pathname !== destination) {
    // Redirect to workspace authentication page
    window.location.assign(destination);
    throw new RedirectError(destination);
  }

  const failure = await response.text();
  let message = `The API answered ${response.status}.`;
  if (failure !== "") {
    try {
      message = (JSON.parse(failure) as Partial<ErrorResponse>).message ?? failure;
    } catch {
      message = failure;
    }
  }

  throw new ApiError(response.status, message);
}

/** Read a route and parse the answer as `T`. Throw what `sendRequest` throws. */
export async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await sendRequest(path, init);
  return (await response.json()) as T;
}

/** Send a write request, with `body` as a JSON payload when it is present. Return the answer without reading it, because most write routes answer `{ status: "ok" }` and no caller needs that. Throw what `sendRequest` throws. */
export async function sendJson(
  path: string,
  method: "POST" | "DELETE",
  body?: unknown,
): Promise<Response> {
  return sendRequest(path, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
