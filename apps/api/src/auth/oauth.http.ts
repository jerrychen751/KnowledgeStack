export class OAuthRequestError extends Error {
  readonly errorCode: string | null;
  readonly operation: string;
  readonly provider: string;
  readonly status: number;

  constructor(
    provider: string,
    operation: string,
    status: number,
    statusText: string,
    body: string,
  ) {
    // The body carries the OAuth error code, such as {"error":"invalid_grant"}, which the status alone does not give.
    super(`${provider} could not ${operation}: ${status} ${statusText}. ${body}`.trimEnd());
    this.name = "OAuthRequestError";
    this.operation = operation;
    this.provider = provider;
    this.status = status;

    let errorCode: string | null = null;
    try {
      const errorBody = JSON.parse(body) as {
        code?: unknown;
        error?: unknown;
      };
      if (typeof errorBody.error === "string") {
        errorCode = errorBody.error;
      } else if (typeof errorBody.code === "string") {
        errorCode = errorBody.code;
      }
    } catch {
      // Some providers return plain text for proxy and server errors.
    }
    this.errorCode = errorCode;
  }
}

/**
 * Send one OAuth request and return the parsed body. Throws OAuthRequestError on any non-2xx answer. Never
 * pass the return value to a log: it holds the token.
 */
export async function fetchOAuthJson<T>(
  fetchImplementation: typeof fetch,
  provider: string,
  operation: string,
  url: URL | string,
  init: RequestInit,
): Promise<T> {
  const { body } = await fetchOAuthResponse<T>(
    fetchImplementation,
    provider,
    operation,
    url,
    init,
  );
  return body;
}

export async function fetchOAuthResponse<T>(
  fetchImplementation: typeof fetch,
  provider: string,
  operation: string,
  url: URL | string,
  init: RequestInit,
): Promise<{ body: T; response: Response }> {
  const response = await fetchImplementation(url, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new OAuthRequestError(
      provider,
      operation,
      response.status,
      response.statusText,
      body.slice(0, 200),
    );
  }

  return {
    body: (await response.json()) as T,
    response,
  };
}
