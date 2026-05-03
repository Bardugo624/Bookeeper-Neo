/**
 * coverCache.ts — cache locale (IndexedDB) per le copertine dei libri.
 *
 * **v9: storage di Blob, non piu' di URL.**
 *
 * Storia:
 *   - v1     blob (mai usato in produzione)
 *   - v2..v8 URL string + onupgradeneeded che cancellava lo store
 *   - v9     Blob (bytes) + onupgradeneeded NON distruttivo
 *
 * Perche' Blob:
 *   - L'IndexedDB e' persistente: vive tra reinstall, update, riavvii.
 *   - Salvare l'URL costringeva il WebView2 a ri-fetchare l'immagine
 *     ogni volta che il suo HTTP cache la evictava → cover che spariscono
 *     dopo aggiornamenti / restart.
 *   - Salvare i bytes garantisce che la cover sia disponibile finche'
 *     l'utente non svuota esplicitamente la cache.
 *
 * Architettura:
 *   - Bytes scaricati lato Go via binding Wails `FetchCoverBytes(url)`.
 *     Bypassa il problema CORS di books.google.com (un browser non
 *     puo' leggere quei bytes; un processo Go si').
 *   - Salviamo `{isbn, blob, sourceUrl, fetchedAt, source}` in IDB.
 *   - `getCover` ritorna un Object URL (blob:) creato al volo, con LRU
 *     per evitare memory leak (Object URL accumulati = memoria persa).
 *
 * Migrazione v8 → v9:
 *   - NON cancelliamo lo store: i record vecchi (con `url` ma senza
 *     `blob`) restano e vengono "promossi" lazy alla prima lettura
 *     scaricando il blob.
 *
 * API invariata per i caller: `getCover(isbn) → Promise<string|null>`.
 */

import { reactive } from 'vue';
import { probeOpenLibrary } from './googleBooks';
import { lookupMetadata, MetadataTransientError, normalizeIsbn as normalizeIsbnUnified } from './metadataLookup';
import { FetchCoverBytes } from '../../wailsjs/go/main/App';

const DB_NAME = 'bookeeper-covers';
// v10: wipe one-shot per ripulire i blob spazzatura salvati da v9 (0.1.12)
// quando il bug di decoding base64 produceva Uint8Array di soli zero.
const DB_VERSION = 10;
const STORE = 'covers';

/**
 * Stato per-ISBN visibile nei componenti BookCover.
 *   - idle       nessuna richiesta in corso, nessuna copertina
 *   - fetching   pipeline in esecuzione (lookup + download)
 *   - cached     copertina disponibile (in liveUrls o IDB)
 *   - failed     errore transiente (rete, fetch fallito, blob corrotto)
 *   - not-found  metadata vuoti o copertina non esistente sui provider
 *
 * `reactive(new Map)` cosi' i componenti Vue si aggiornano automaticamente.
 */
export type CoverStatus = 'idle' | 'fetching' | 'cached' | 'failed' | 'not-found';
const statusMap = reactive(new Map<string, CoverStatus>());
function setStatus(isbn: string, s: CoverStatus): void { statusMap.set(isbn, s); }
export function getCoverStatus(rawIsbn: string | null | undefined): CoverStatus {
    if (!rawIsbn) return 'idle';
    const isbn = normalizeIsbnUnified(rawIsbn);
    return statusMap.get(isbn) ?? 'idle';
}

interface CoverRecord {
    isbn: string;
    /** Bytes della copertina. Presente da v9 in poi. */
    blob?: Blob;
    /** URL sorgente (ricordato per debug e per re-fetch). */
    sourceUrl: string;
    /** Vecchio campo v2..v8: solo URL. Letto per migrazione lazy. */
    url?: string;
    fetchedAt: number;
    /** Provider (google-books / open-library / annas-archive / unknown). */
    source: string;
}

// LRU di Object URL "vivi". Quando supera maxLiveUrls, revoca il piu'
// vecchio per liberare la memoria del blob associato.
const liveUrls = new Map<string, string>(); // isbn → objectURL
const maxLiveUrls = 300;
const inFlight = new Map<string, Promise<string | null>>();
const negatives = new Set<string>();

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (ev) => {
            const db = req.result;
            const oldVersion = (ev as IDBVersionChangeEvent).oldVersion ?? 0;
            // Crea lo store se non esiste (prima install).
            if (!db.objectStoreNames.contains(STORE)) {
                db.createObjectStore(STORE, { keyPath: 'isbn' });
                return;
            }
            // v10: wipe one-shot dei blob garbage prodotti da v9 (0.1.12).
            // Vecchio bug: `new Uint8Array(stringaBase64)` iterava i char e
            // producevaono NaN→0, salvando blob di soli zeri non decodificabili.
            // Wipe-and-refetch e' piu' affidabile di tentare di distinguere
            // blob validi da blob corrotti per dimensione/magic-bytes.
            if (oldVersion < 10) {
                try {
                    const tx = req.transaction;
                    if (tx) tx.objectStore(STORE).clear();
                } catch (e) {
                    if (import.meta.env.DEV) console.debug('[coverCache] v10 wipe failed', e);
                }
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
    });
    return dbPromise;
}

async function dbGet(isbn: string): Promise<CoverRecord | null> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).get(isbn);
        req.onsuccess = () => resolve((req.result as CoverRecord | undefined) ?? null);
        req.onerror = () => reject(req.error);
    });
}

async function dbPut(rec: CoverRecord): Promise<void> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(rec);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

async function dbAll(): Promise<CoverRecord[]> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).getAll();
        req.onsuccess = () => resolve((req.result as CoverRecord[]) ?? []);
        req.onerror = () => reject(req.error);
    });
}

async function dbClear(): Promise<void> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

async function dbDelete(isbn: string): Promise<void> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(isbn);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

function normalizeIsbn(isbn: string): string {
    return normalizeIsbnUnified(isbn);
}

/**
 * Crea (o ricicla) un Object URL per il blob dato. Se l'isbn ne aveva
 * gia' uno, lo revoca prima di rimpiazzarlo. Evicta il piu' vecchio
 * quando supera il cap, per evitare leak di memoria.
 */
function blobToObjectUrl(isbn: string, blob: Blob): string {
    const existing = liveUrls.get(isbn);
    if (existing) {
        URL.revokeObjectURL(existing);
        liveUrls.delete(isbn);
    }
    const url = URL.createObjectURL(blob);
    liveUrls.set(isbn, url);
    if (liveUrls.size > maxLiveUrls) {
        const oldestKey = liveUrls.keys().next().value as string | undefined;
        if (oldestKey && oldestKey !== isbn) {
            const oldestUrl = liveUrls.get(oldestKey);
            if (oldestUrl) URL.revokeObjectURL(oldestUrl);
            liveUrls.delete(oldestKey);
        }
    }
    return url;
}

/**
 * Risolve l'URL di copertina via lookup metadata + probe candidati.
 * Restituisce l'URL pronto per essere passato a FetchCoverBytes.
 *
 * `fresh = true` salta la cache server (usato dal pulsante "ricarica").
 */
async function resolveCoverUrl(
    isbn: string,
    fresh = false,
): Promise<{ url: string; source: string } | null | 'transient'> {
    let info: Awaited<ReturnType<typeof lookupMetadata>> = null;
    try {
        info = await lookupMetadata(isbn, fresh);
    } catch (e) {
        if (e instanceof MetadataTransientError) {
            if (import.meta.env.DEV) console.debug('[coverCache]', isbn, 'lookup transient', e.message);
            return 'transient';
        }
        if (import.meta.env.DEV) console.debug('[coverCache]', isbn, 'lookup err', e);
        return 'transient';
    }
    if (!info) return null;

    const candidates = info.coverCandidates ?? [];
    if (import.meta.env.DEV) console.debug('[coverCache]', isbn, 'candidates:', candidates);

    // OpenLibrary: probiamo via <img> (rispetta `?default=false` server).
    // Per i non-OL ci affidiamo a FetchCoverBytes: se i bytes arrivano
    // validi → e' una copertina vera.
    for (const url of candidates) {
        const isOL = /covers\.openlibrary\.org/.test(url);
        if (isOL) {
            const ok = await probeOpenLibrary(url);
            if (!ok) continue;
        }
        const source = isOL
            ? 'open-library'
            : /books\.google/.test(url)
              ? 'google-books'
              : info.sources?.[0] ?? 'unknown';
        return { url, source };
    }
    return null;
}

/**
 * Restituisce un Object URL pronto per `<img src>` o `null` se la
 * copertina non e' disponibile. Pipeline:
 *   memoria → IndexedDB (con migrazione lazy v8→v9 se manca il blob)
 *           → resolveCoverUrl + FetchCoverBytes → IDB
 */
export async function getCover(rawIsbn: string | null | undefined, fresh = false): Promise<string | null> {
    if (!rawIsbn) return null;
    const isbn = normalizeIsbn(rawIsbn);
    if (isbn.length < 10) return null;

    const live = liveUrls.get(isbn);
    if (live && !fresh) {
        setStatus(isbn, 'cached');
        return live;
    }

    if (negatives.has(isbn) && !fresh) {
        setStatus(isbn, 'not-found');
        return null;
    }

    const pending = inFlight.get(isbn);
    if (pending && !fresh) return pending;

    setStatus(isbn, 'fetching');

    const job = (async () => {
        try {
            const cached = await dbGet(isbn);

            // Hot path: record completo con blob → ricicliamo.
            if (cached?.blob) {
                const url = blobToObjectUrl(isbn, cached.blob);
                setStatus(isbn, 'cached');
                return url;
            }

            // Determina l'URL sorgente: se il record v8 esiste lo
            // riusiamo (evita re-lookup metadata); altrimenti lo
            // risolviamo da zero.
            let sourceUrl: string;
            let source: string;
            if (cached?.sourceUrl) {
                sourceUrl = cached.sourceUrl;
                source = cached.source ?? 'unknown';
            } else if (cached?.url) {
                // Migrazione v8 → v9: il record vecchio aveva `url`.
                sourceUrl = cached.url;
                source = cached.source ?? 'unknown';
            } else {
                const resolved = await resolveCoverUrl(isbn, fresh);
                if (resolved === null) {
                    negatives.add(isbn);
                    setStatus(isbn, 'not-found');
                    return null;
                }
                if (resolved === 'transient') {
                    setStatus(isbn, 'failed');
                    return null;
                }
                sourceUrl = resolved.url;
                source = resolved.source;
            }

            // Scarica i bytes via Wails (no CORS).
            let fetched: Awaited<ReturnType<typeof FetchCoverBytes>>;
            try {
                fetched = await FetchCoverBytes(sourceUrl);
            } catch (e) {
                if (import.meta.env.DEV) console.debug('[coverCache]', isbn, 'fetch bytes err', e);
                setStatus(isbn, 'failed');
                return null; // transiente: non poison
            }
            if (!fetched?.data) {
                negatives.add(isbn);
                setStatus(isbn, 'not-found');
                return null;
            }

            // Wails/Go serializza `[]byte` come **stringa base64**
            // (encoding/json standard). Il binding TS lo dichiara come
            // number[] ma a runtime e' una string. Gestiamo entrambi
            // i casi per resilienza:
            //   - string  → atob → Uint8Array
            //   - array   → Uint8Array.from(...)
            //   - Uint8Array → as-is (Wails alpha o futura versione)
            const raw = fetched.data as unknown;
            let u8: Uint8Array;
            if (typeof raw === 'string') {
                const bin = atob(raw);
                u8 = new Uint8Array(bin.length);
                for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
            } else if (raw instanceof Uint8Array) {
                u8 = raw;
            } else if (Array.isArray(raw)) {
                u8 = Uint8Array.from(raw as number[]);
            } else {
                if (import.meta.env.DEV) console.debug('[coverCache]', isbn, 'shape data inattesa', typeof raw, raw);
                setStatus(isbn, 'failed');
                return null;
            }
            if (u8.byteLength === 0) {
                negatives.add(isbn);
                setStatus(isbn, 'not-found');
                return null;
            }
            const buf = u8.buffer.slice(
                u8.byteOffset,
                u8.byteOffset + u8.byteLength,
            ) as ArrayBuffer;
            const blob = new Blob([buf], { type: fetched.contentType || 'image/jpeg' });

            await dbPut({
                isbn,
                blob,
                sourceUrl,
                source,
                fetchedAt: Date.now(),
            });
            const url = blobToObjectUrl(isbn, blob);
            setStatus(isbn, 'cached');
            return url;
        } catch (e) {
            if (import.meta.env.DEV) console.debug('[coverCache]', isbn, 'pipeline err', e);
            negatives.add(isbn);
            setStatus(isbn, 'failed');
            return null;
        } finally {
            inFlight.delete(isbn);
        }
    })();

    inFlight.set(isbn, job);
    return job;
}

/** Numero di copertine in cache. */
export async function cacheStats(): Promise<{ count: number }> {
    try {
        const all = await dbAll();
        return { count: all.length };
    } catch {
        return { count: 0 };
    }
}

/** Svuota la cache copertine. Revoca anche tutti gli Object URL vivi. */
export async function clearCovers(): Promise<void> {
    for (const url of liveUrls.values()) URL.revokeObjectURL(url);
    liveUrls.clear();
    negatives.clear();
    statusMap.clear();
    await dbClear();
}

/**
 * Forza il re-download di una copertina, bypassando cache (memoria,
 * IDB, negative). Usato dal pulsante "ricarica" in BookCover.
 *
 * Step:
 *   1. revoca Object URL in memoria
 *   2. rimuove l'isbn dalla negative cache (cosi' non e' bloccato)
 *   3. cancella il record IDB (forza nuovo lookup metadata + fetch)
 *   4. resetta lo status e ri-esegue la pipeline
 */
export async function forceRefetch(rawIsbn: string | null | undefined): Promise<string | null> {
    if (!rawIsbn) return null;
    const isbn = normalizeIsbn(rawIsbn);
    if (isbn.length < 10) return null;
    const live = liveUrls.get(isbn);
    if (live) {
        URL.revokeObjectURL(live);
        liveUrls.delete(isbn);
    }
    negatives.delete(isbn);
    inFlight.delete(isbn);
    try { await dbDelete(isbn); } catch (e) {
        if (import.meta.env.DEV) console.debug('[coverCache]', isbn, 'dbDelete err', e);
    }
    setStatus(isbn, 'idle');
    return getCover(isbn, true);
}

/**
 * Marca il record corrente come corrotto: cancella il record IDB e
 * setta status='failed'. Chiamato da BookCover quando `<img>` fallisce
 * il decode di un blob (URL stale, blob garbage v9, ecc.). NON ri-fetcha
 * automaticamente: l'utente decide se cliccare "ricarica" (evita loop
 * di re-fetch su URL persistentemente broken).
 */
export async function markBad(rawIsbn: string | null | undefined): Promise<void> {
    if (!rawIsbn) return;
    const isbn = normalizeIsbn(rawIsbn);
    if (isbn.length < 10) return;
    const live = liveUrls.get(isbn);
    if (live) {
        URL.revokeObjectURL(live);
        liveUrls.delete(isbn);
    }
    setStatus(isbn, 'failed');
    try { await dbDelete(isbn); } catch (e) {
        if (import.meta.env.DEV) console.debug('[coverCache]', isbn, 'markBad dbDelete err', e);
    }
}
