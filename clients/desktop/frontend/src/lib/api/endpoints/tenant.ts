/**
 * lib/api/endpoints/tenant.ts
 *
 * Endpoint del proprio tenant (lettura info, rotazione invite_code).
 * Tutto su superficie mTLS autenticata via /api/v1/tenant.
 */
import { api } from '../client'

export interface TenantInfo {
  id: string
  name: string
  invite_code: string
  created_at: number
  ca_fingerprint: string
  is_owner: boolean
  owner_email?: string
}

export const tenantEndpoints = {
  get: (): Promise<TenantInfo> => api.get<TenantInfo>('/api/v1/tenant'),
  rotateInvite: (admin_password: string): Promise<{ invite_code: string }> =>
    api.post<{ invite_code: string }>('/api/v1/tenant/rotate-invite', { admin_password }),
}
