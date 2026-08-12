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
  fetchImplementation: typeof fetch,
  provider: string,
  operation: string,
  url: URL | string,
  init?: RequestInit,
): Promise<{ body: T; response: Response }> {
  const response = await fetchImplementation(url, init);
  if (!response.ok) {
    throw new ConnectorRequestError(
      provider,
      operation,
      response.status,
      response.statusText,
      response.headers.get("retry-after"),
    );
  }

  return {
    body: (await response.json()) as T,
    response,
  };
}
