export class ConnectorRequestError extends Error {
  readonly operation: string;
  readonly provider: string;
  readonly retryAfter: string | null;
  readonly status: number;

  constructor(
    provider: string,
    operation: string,
    status: number,
    statusText: string,
    retryAfter: string | null,
  ) {
    super(`${provider} could not ${operation}: ${status} ${statusText}.`);
    this.name = "ConnectorRequestError";
    this.operation = operation;
    this.provider = provider;
    this.retryAfter = retryAfter;
    this.status = status;
  }
}

export async function fetchConnectorJson<T>(
  provider: string,
  operation: string,
  url: URL | string,
  init?: RequestInit,
): Promise<{ body: T; response: Response }> {
  const maxRetries = 4;
  for (let attempt = 0; ; attempt += 1) {
    let response: Response;
    try {
      // Build the signal inside the loop: an AbortSignal fires once and stays aborted for every later attempt.
      const timeout = AbortSignal.timeout(30000);
      response = await fetch(url, {
        ...init,
        // The spread would drop the signal of the caller, so combine the two instead of replacing one.
        signal:
          init?.signal === undefined || init.signal === null
            ? timeout
            : AbortSignal.any([init.signal, timeout]),
      });
    } catch (error) {
      // fetch throws a TimeoutError when the signal aborts and a TypeError when the connection fails.
      // Neither carries a status, so neither can become a ConnectorRequestError.
      // A caller that aborts wants the request to stop, so a retry would defeat the abort.
      if (init?.signal?.aborted === true || attempt === maxRetries) {
        throw new Error(`${provider} could not ${operation}.`, { cause: error });
      }
      await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * 1000));
      continue;
    }

    if (response.ok) {
      return {
        body: (await response.json()) as T,
        response,
      };
    }

    const retryAfter = response.headers.get("retry-after");
    const isRetryable = response.status === 429 || response.status >= 500;
    if (!isRetryable || attempt === maxRetries) {
      throw new ConnectorRequestError(
        provider,
        operation,
        response.status,
        response.statusText,
        retryAfter,
      );
    }

    // Retry-After is optional on a 429 and absent on a 5xx. Notion and Confluence send whole seconds, such as '30'.
    // Number(null) is 0 and Number of an HTTP-date is NaN, so both fall through to the backoff below.
    const retryAfterMs = Number(retryAfter) * 1000;
    // The cap stops one long Retry-After from stalling the pass. An aborted pass resumes at the failed document.
    const delay = Math.min(
      retryAfterMs > 0 ? retryAfterMs : 2 ** attempt * 1000,
      60000,
    );
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}
