import { invoke } from '@tauri-apps/api/core';
import { ApiError, type Transport } from '@bookeeper/api';

interface ApiResponse {
  status: number;
  body: string;
}

export function createTauriTransport(): Transport {
  return {
    async request(method, path, body) {
      let res: ApiResponse;
      try {
        res = await invoke<ApiResponse>('api_request', {
          method,
          path,
          body: body === undefined ? null : JSON.stringify(body),
        });
      } catch (e) {
        // Same contract as the fetch transport: an unreachable core is a network error.
        throw new ApiError(0, 'network', e instanceof Error ? e.message : String(e));
      }
      let parsed: unknown = res.body;
      try {
        parsed = res.body === '' ? null : JSON.parse(res.body);
      } catch {
        parsed = res.body;
      }
      return { status: res.status, body: parsed };
    },
  };
}
