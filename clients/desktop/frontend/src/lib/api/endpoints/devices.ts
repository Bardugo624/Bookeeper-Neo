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
    expires_at: string; // RFC3339
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
    paired_at: string;
    last_seen_at?: string;
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
};
