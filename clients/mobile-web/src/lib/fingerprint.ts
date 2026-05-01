// Bookeeper Mobile — device certificate fingerprint helper.
//
// The mobile API surface gates every request behind:
//   - JWT bearer (proves the calling principal at the time of pairing)
//   - X-Device-Cert-Fingerprint header (binds the JWT to the cert that was
//     issued during pairing)
//
// Fingerprint format MUST match what the Go server stores in
// `devices.cert_fingerprint`: SHA-256 of the certificate DER, hex-encoded
// lowercase. The server side sets this in ca.IssueClient and looks it up
// from the header in mw/MobileAuthn.

/**
 * Compute the SHA-256 hex of a PEM-encoded X.509 certificate's DER bytes.
 * Mirrors `ca.FingerprintPEM` on the server.
 */
export async function fingerprintFromCertPem(certPem: string): Promise<string> {
    const der = pemToDer(certPem);
    // Allocate a fresh ArrayBuffer (not the lib.dom union ArrayBufferLike)
    // so SubtleCrypto.digest's strict BufferSource type accepts it.
    const buf = new ArrayBuffer(der.byteLength);
    new Uint8Array(buf).set(der);
    const hash = await crypto.subtle.digest('SHA-256', buf);
    return bytesToHex(new Uint8Array(hash));
}

function pemToDer(pem: string): Uint8Array {
    const match = pem.match(/-----BEGIN CERTIFICATE-----([\s\S]+?)-----END CERTIFICATE-----/);
    if (!match) throw new Error('invalid certificate PEM');
    const b64 = match[1].replace(/\s+/g, '');
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

function bytesToHex(bytes: Uint8Array): string {
    let out = '';
    for (let i = 0; i < bytes.length; i++) {
        out += bytes[i].toString(16).padStart(2, '0');
    }
    return out;
}
