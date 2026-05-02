/**
 * lib/api/endpoints/devices.ts
 *
 * Pairing token lifecycle for the mobile companion. mTLS-only, requires the
 * desktop session to already be authenticated (only the desktop "owner"
 * device can mint tokens that bring up additional clients on the same tenant).
 */
import { api } from '../client';

export interface PairingToken {
    token: string;
    /** Unix timestamp in **seconds** (server returns int64). */
    expires_at: number;
    pairing_url: string;
    server_fingerprint: string;
    qr_payload: string; // https://<host>/m/?pair=<token>
}

export interface PairingTokenStatus {
    used: boolean;
    expired: boolean;
    device_id?: string;
    device_name?: string;
    used_at?: string;
}

export interface DeviceSummary {
    id: string;
    name: string;
    kind: string;
    user_id: string;
    cert_fingerprint: string;
    /** Unix timestamp in **seconds** (server returns int64). */
    paired_at: number;
    /** Unix timestamp in **seconds**, omitted if the device never came online. */
    last_seen?: number;
    revoked: boolean;
}

interface ListResp {
    devices: DeviceSummary[];
}

export const devicesEndpoints = {
    list: (): Promise<DeviceSummary[]> =>
        api
            .get<ListResp>('/api/v1/devices')
            .then((r) => r.devices ?? []),

    createPairingToken: (): Promise<PairingToken> =>
        api.post<PairingToken>('/api/v1/devices/pairing-token', {}),

    getPairingTokenStatus: (token: string): Promise<PairingTokenStatus> =>
        api.get<PairingTokenStatus>(
            `/api/v1/devices/pairing-token/${encodeURIComponent(token)}/status`,
        ),

    revoke: (id: string): Promise<void> =>
        api.post<void>(`/api/v1/devices/${id}/revoke`, {}),

    /**
     * Stato della CA tenant in memoria. Se `unlocked === false` il pairing
     * mobile non puo' essere generato finche' un admin non chiama caUnlock
     * almeno una volta (operazione una-tantum: il server poi auto-sblocca
     * ad ogni restart).
     */
    caStatus: (): Promise<{ unlocked: boolean }> =>
        api.get<{ unlocked: boolean }>('/api/v1/ca/status'),

    /**
     * Sblocca la CA del tenant fornendo l'admin password. Side-effect:
     * popola lo slot di auto-unlock server-side cosi' che da quel momento
     * in poi nessuna admin pwd venga piu' richiesta.
     */
    caUnlock: (adminPassword: string): Promise<void> =>
        api.post<void>('/api/v1/ca/unlock', { admin_password: adminPassword }),
};
