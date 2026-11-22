export interface TransportResponse {
  status: number;
  body: unknown;
}

export interface Transport {
  request(
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<TransportResponse>;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export function createFetchTransport(baseUrl: string, fetchImpl: typeof fetch = (...a) => fetch(...a)): Transport {
  const base = baseUrl.replace(/\/+$/, '');
  return {
    async request(method, path, body) {
      let res: Response;
      try {
        res = await fetchImpl(`${base}${path}`, {
          method,
          headers: body === undefined ? undefined : { 'content-type': 'application/json' },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      } catch (e) {
        throw new ApiError(0, 'network', e instanceof Error ? e.message : 'network error');
      }
      const text = await res.text();
      let parsed: unknown = text;
      try {
        parsed = text === '' ? null : JSON.parse(text);
      } catch {
        parsed = text;
      }
      return { status: res.status, body: parsed };
    },
  };
}
