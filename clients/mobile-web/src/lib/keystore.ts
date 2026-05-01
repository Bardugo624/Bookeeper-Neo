// Bookeeper Mobile — IndexedDB keystore.
//
// Persists the device credentials (cert PEM, non-extractable private CryptoKey,
// JWT pair, server fingerprint) across PWA launches.
//
// Why IndexedDB and not localStorage:
// - Stores `CryptoKey` objects natively via structured clone, so the EC P-256
//   private key never leaves the browser as PEM/JWK plaintext.
// - Survives "Add to Home Screen" / standalone PWA cold start.
// - Larger quota; mutations are async (no main-thread blocking).
//
// Schema is intentionally a single key/value store so the API stays simple:
// `keystore.load()` is the source of truth for "is this device paired?".
import { openDB, type IDBPDatabase } from 'idb';

export interface StoredCredentials {
    deviceId: string;
    deviceName: string;
    /** PEM-encoded mobile client certificate signed by the tenant CA. */
    certPem: string;
    /** SHA-256 hex of the cert DER (matches devices.cert_fingerprint server-side).
     *  Sent on every authenticated request as `X-Device-Cert-Fingerprint`. */
    certFingerprint: string;
    /** PEM-encoded tenant CA cert; the PWA pins this to verify the server. */
    caCertPem: string;
    /** Non-extractable EC P-256 private key (matches certPem public key). */
    privateKey: CryptoKey;
    accessToken: string;
    refreshToken: string;
    pairedAt: number;
}

const DB_NAME = 'bookeeper-mobile';
const STORE = 'creds';
const KEY = 'self';
const VERSION = 1;

let dbPromise: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
    if (!dbPromise) {
        dbPromise = openDB(DB_NAME, VERSION, {
            upgrade(d) {
                if (!d.objectStoreNames.contains(STORE)) {
                    d.createObjectStore(STORE);
                }
            },
        });
    }
    return dbPromise;
}

export const keystore = {
    async load(): Promise<StoredCredentials | undefined> {
        const d = await db();
        return (await d.get(STORE, KEY)) as StoredCredentials | undefined;
    },

    async save(creds: StoredCredentials): Promise<void> {
        const d = await db();
        await d.put(STORE, creds, KEY);
    },

    async updateTokens(access: string, refresh: string): Promise<void> {
        const d = await db();
        const cur = (await d.get(STORE, KEY)) as StoredCredentials | undefined;
        if (!cur) return;
        cur.accessToken = access;
        cur.refreshToken = refresh;
        await d.put(STORE, cur, KEY);
    },

    async updateName(name: string): Promise<void> {
        const d = await db();
        const cur = (await d.get(STORE, KEY)) as StoredCredentials | undefined;
        if (!cur) return;
        cur.deviceName = name;
        await d.put(STORE, cur, KEY);
    },

    async wipe(): Promise<void> {
        const d = await db();
        await d.delete(STORE, KEY);
    },
};
