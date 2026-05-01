/**
 * lib/api/client.ts
 *
 * Wrapper TypeScript sopra il binding Wails `ApiRequest`. Tutto il traffico
 * mTLS verso il backend Bookeeper passa da qui.
 *
 * Perché un solo binding generico (ApiRequest) e poi metodi TS tipati:
 * - Evita di aggiungere un metodo Go per ogni endpoint.
 * - Mantiene il routing/serializzazione lato Go (tls + auth header).
 * - Ci dà il type-checking in JS senza ri-generare bindings ad ogni nuovo
 *   endpoint.
 *
 * Errori: rilancia `ApiError` con `status` e `body` quando il backend
 * risponde non-2xx; rilancia `Error` generico per problemi di rete o di
 * sessione mancante.
 */

import { ApiRequest } from '../../../wailsjs/go/main/App'

export class ApiError extends Error {
  constructor(public status: number, public body: string) {
    super(`API ${status}: ${body}`)
    this.name = 'ApiError'
  }
}

const API_ERR_RE = /^api error (\d+):\s*(.*)$/s

function toApiError(err: unknown): never {
  const msg = err instanceof Error ? err.message : String(err)
  const m = msg.match(API_ERR_RE)
  if (m) throw new ApiError(parseInt(m[1], 10), m[2])
  throw new Error(msg)
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const payload = body === undefined || body === null ? '' : JSON.stringify(body)
  try {
    const raw = await ApiRequest(method, path, payload)
    if (!raw) return undefined as T
    return JSON.parse(raw) as T
  } catch (err) {
    return toApiError(err)
  }
}

export const api = {
  get: <T>(path: string) => call<T>('GET', path),
  post: <T>(path: string, body?: unknown) => call<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => call<T>('PATCH', path, body),
  delete: <T>(path: string) => call<T>('DELETE', path),
}
