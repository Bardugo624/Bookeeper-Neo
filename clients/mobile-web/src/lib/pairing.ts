// Bookeeper Mobile — pairing orchestrator.
//
// Single entry point `redeemPairingToken(token)` that:
//   1. Generates an EC P-256 keypair + PKCS#10 CSR (random device name).
//   2. POSTs /pairing/redeem with {token, csr_pem, device_name}.
//   3. Persists everything in the IndexedDB keystore.
//
// The router guard calls this on first load when `?pair=<token>` is present
// and no credentials exist yet. UX is silent: splash → home.

import { ApiError } from './api';
import { keystore } from './keystore';
import { generateKeypairAndCsr, randomDeviceName } from './crypto/csr';
import { fingerprintFromCertPem } from './fingerprint';

// Re-export so callers can import api/ApiError from a single module.
export { api, ApiError } from './api';

interface RedeemResp {
    device_id: string;
    cert_pem: string;
    ca_cert_pem: string;
    access_token: string;
    refresh_token: string;
}

export interface RedeemResult {
    deviceId: string;
    deviceName: string;
}

/**
 * Redeem a pairing token. Throws `ApiError` on failure (token expired/used,
 * tenant CA locked, network down) — caller decides what to render.
 *
 * The bootstrap server is on a separate port (8080 by default), but in prod
 * Caddy fronts both on the same hostname; we POST to relative `/pairing/redeem`
 * which Caddy routes to the bootstrap surface. Override via VITE_BOOTSTRAP_BASE
 * for local dev.
 */
export async function redeemPairingToken(token: string): Promise<RedeemResult> {
    const deviceName = randomDeviceName();
    const { privateKey, csrPem } = await generateKeypairAndCsr(deviceName);

    const base = import.meta.env.VITE_BOOTSTRAP_BASE ?? '';
    let res: RedeemResp;
    try {
        const r = await fetch(`${base}/pairing/redeem`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                token,
                device_name: deviceName,
                csr_pem: csrPem,
            }),
        });
        const text = await r.text();
        if (!r.ok) throw new ApiError(r.status, text || r.statusText);
        res = JSON.parse(text) as RedeemResp;
    } catch (err) {
        if (err instanceof ApiError) throw err;
        throw new ApiError(0, err instanceof Error ? err.message : 'network error');
    }

    const certFingerprint = await fingerprintFromCertPem(res.cert_pem);

    await keystore.save({
        deviceId: res.device_id,
        deviceName,
        certPem: res.cert_pem,
        certFingerprint,
        caCertPem: res.ca_cert_pem,
        privateKey,
        accessToken: res.access_token,
        refreshToken: res.refresh_token,
        pairedAt: Date.now(),
    });

    return { deviceId: res.device_id, deviceName };
}

/**
 * Use after `?pair=<token>` consumed (or login failed): wipe local creds.
 * Idempotent.
 */
export async function unpair(): Promise<void> {
    await keystore.wipe();
}
