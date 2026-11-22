import { invoke } from '@tauri-apps/api/core';
import type { Transport } from '@bookeeper/api';

interface ApiResponse {
  status: number;
  body: string;
}

export function createTauriTransport(): Transport {
  return {
    async request(method, path, body) {
      const res = await invoke<ApiResponse>('api_request', {
        method,
        path,
        body: body === undefined ? null : JSON.stringify(body),
      });
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
