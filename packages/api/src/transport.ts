export interface TransportResponse {
  status: number;
  body: unknown;
  /** Seconds from the `Retry-After` header, when numeric. */
  retryAfter?: number;
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
  readonly retryAfter: number | undefined;

  constructor(status: number, code: string, message: string, retryAfter?: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

export interface FetchTransportOptions {
  getAccessToken?: () => string | null | Promise<string | null>;
}

function parseRetryAfter(v: string | null | undefined): number | undefined {
  if (v == null || !/^\s*\d+\s*$/.test(v)) return undefined;
  return Number(v);
}

export function createFetchTransport(
  baseUrl: string,
  fetchImpl: typeof fetch = (...a) => fetch(...a),
  options: FetchTransportOptions = {},
): Transport {
  const base = baseUrl.replace(/\/+$/, '');
  return {
    async request(method, path, body) {
      let res: Response;
      let text: string;
      try {
        const headers: Record<string, string> = {};
        if (body !== undefined) headers['content-type'] = 'application/json';
        const token = options.getAccessToken ? await options.getAccessToken() : null;
        if (typeof token === 'string' && token !== '') headers.authorization = `Bearer ${token}`;
        res = await fetchImpl(`${base}${path}`, {
          method,
          headers: Object.keys(headers).length === 0 ? undefined : headers,
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        text = await res.text();
      } catch (e) {
        throw new ApiError(0, 'network', e instanceof Error ? e.message : 'network error');
      }
      let parsed: unknown = text;
      try {
        parsed = text === '' ? null : JSON.parse(text);
      } catch {
        parsed = text;
      }
      const retryAfter = parseRetryAfter(res.headers?.get('retry-after'));
      return retryAfter === undefined ? { status: res.status, body: parsed } : { status: res.status, body: parsed, retryAfter };
    },
  };
}
