// Bookeeper Mobile — Web Crypto + pkijs CSR builder.
//
// Generates an ECDSA P-256 keypair via SubtleCrypto with `extractable: false`
// for the private key (so it can't be exfiltrated as PEM/JWK). Builds a
// PKCS#10 CSR signed with the same key and returns it as PEM, ready to POST
// to /pairing/redeem.
//
// pkijs accepts a `CryptoKey` directly via `subjectPublicKeyInfo.importKey`
// and signs with `csr.sign(privateKey, 'SHA-256')`, so we don't need to
// export the private key material.

import * as asn1js from 'asn1js';
import {
    AttributeTypeAndValue,
    CertificationRequest,
    setEngine,
    CryptoEngine,
} from 'pkijs';

// pkijs needs an explicit engine in the browser (it falls back to Node otherwise).
const cryptoEngine = new CryptoEngine({
    name: 'WebCrypto',
    crypto: globalThis.crypto,
    subtle: globalThis.crypto.subtle,
});
setEngine('WebCrypto', cryptoEngine);

export interface KeypairAndCsr {
    privateKey: CryptoKey; // non-extractable
    publicKey: CryptoKey;
    csrPem: string;
}

/**
 * Generate an EC P-256 keypair (non-extractable private key) and build a
 * PKCS#10 CSR with `CN=<commonName>`. The CSR is signed by the freshly
 * generated key and returned in PEM form.
 */
export async function generateKeypairAndCsr(commonName: string): Promise<KeypairAndCsr> {
    const algo: EcKeyAlgorithm = { name: 'ECDSA', namedCurve: 'P-256' };

    const keypair = await crypto.subtle.generateKey(
        algo,
        false, // private key non-extractable
        ['sign', 'verify'],
    );
    // SubtleCrypto returns a CryptoKeyPair; private key is non-extractable
    // even though the public key is. That's exactly what we want.
    const { privateKey, publicKey } = keypair as CryptoKeyPair;

    const csr = new CertificationRequest();
    csr.version = 0;
    csr.subject.typesAndValues.push(
        new AttributeTypeAndValue({
            type: '2.5.4.3', // commonName
            value: new asn1js.Utf8String({ value: commonName }),
        }),
    );
    // Empty attributes [0] IMPLICIT SET. pkijs OMITS the whole field when
    // `attributes` is undefined, producing a CSR without the trailing `A0 00`.
    // Go's encoding/asn1 parser then rejects it with
    // "asn1: syntax error: sequence truncated" because PKCS#10 requires the
    // field to be present (even if empty).
    csr.attributes = [];

    // Import the public key into the CSR's subjectPublicKeyInfo.
    await csr.subjectPublicKeyInfo.importKey(publicKey);

    // Sign CSR with the matching private key. ECDSA-with-SHA256.
    await csr.sign(privateKey, 'SHA-256');

    // IMPORTANT: pass `true` to force re-encoding from current state.
    // Without it pkijs may reuse a cached schema captured BEFORE sign()
    // populated signatureAlgorithm + signatureValue, producing a CSR
    // with a truncated BIT STRING that Go rejects with
    // "asn1: syntax error: sequence truncated".
    const der = csr.toSchema(true).toBER(false);
    const b64 = base64Encode(new Uint8Array(der));
    const csrPem = wrapPem('CERTIFICATE REQUEST', b64);

    return { privateKey, publicKey, csrPem };
}

function base64Encode(bytes: Uint8Array): string {
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
}

function wrapPem(label: string, b64: string): string {
    const lines = b64.match(/.{1,64}/g) ?? [];
    return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----\n`;
}

/**
 * Random 4-hex device suffix → CN like "mobile-a4f9". Generated client-side
 * pre-CSR; user can rename later via Account tab.
 */
export function randomDeviceName(): string {
    const buf = new Uint8Array(2);
    crypto.getRandomValues(buf);
    const hex = Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
    return `mobile-${hex}`;
}
