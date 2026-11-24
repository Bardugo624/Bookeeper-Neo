import { invoke } from '@tauri-apps/api/core';
import { ApiError, type Transport } from '@bookeeper/api';

interface ApiResponse {
  status: number;
  body: string;
}

interface RawApiResponse {
  status: number;
  body_base64: string;
  content_type: string | null;
  headers: Record<string, string>;
}

const CHUNK = 0x8000;

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function networkError(e: unknown): ApiError {
  // Same contract as the fetch transport: an unreachable core is a network error.
  return new ApiError(0, 'network', e instanceof Error ? e.message : String(e));
}

export function createTauriTransport(): Transport {
  return {
    async request(method, path, body, headers) {
      let res: ApiResponse;
      try {
        res = await invoke<ApiResponse>('api_request', {
          method,
          path,
          body: body === undefined ? null : JSON.stringify(body),
          ...(headers === undefined ? {} : { headers }),
        });
      } catch (e) {
        throw networkError(e);
      }
      let parsed: unknown = res.body;
      try {
        parsed = res.body === '' ? null : JSON.parse(res.body);
      } catch {
        parsed = res.body;
      }
      return { status: res.status, body: parsed };
    },
    async requestRaw(req) {
      let res: RawApiResponse;
      try {
        res = await invoke<RawApiResponse>('api_request_raw', {
          method: req.method,
          path: req.path,
          body_base64: req.body === undefined ? null : toBase64(req.body),
          content_type: req.contentType ?? null,
          headers: req.headers ?? {},
        });
      } catch (e) {
        throw networkError(e);
      }
      return {
        status: res.status,
        bytes: fromBase64(res.body_base64),
        contentType: res.content_type,
        headers: res.headers,
      };
    },
  };
}
