/**
 * coverCache.ts â€” cache locale (IndexedDB) per le copertine dei libri
 * scaricate da Google Books. Tutto client-side: non passa mai dal server.
 *
 * Schema:
 *   db `bookeeper-covers` v2
 *   store `covers` keyPath `isbn` â†’ { isbn, url, fetchedAt, source }
 *
 * IMPORTANTE â€” perche' cachiamo l'URL e non il blob:
 *   `books.google.com/books/content?...` non emette header CORS, quindi
 *   `fetch(url)` lato browser fallisce con un errore CORS opaque (0
 *   byte). Lo stesso URL pero' funziona perfettamente come `<img src>`,
 *   perche' i tag `<img>` sono esenti da CORS quando non si tenta di
 *   leggere i pixel via canvas. Soluzione: chiediamo SOLO i metadati
 *   all'API JSON di Google Books (CORS-friendly), salviamo l'URL e
 *   lasciamo che il browser gestisca la cache HTTP dei byte.
 *
 * API:
 *   - `getCover(isbn)` â†’ Promise<string|null> (URL pronto per <img>)
 *   - `cacheStats()`   â†’ { count }
 *   - `clearCovers()`  â†’ svuota tutto
 *
 * Note:
 *   - Le richieste in volo sono deduplicate (stesso ISBN cliccato 2 volte
 *     in rapida sequenza â†’ un solo fetch).
 *   - I "negativi" (ISBN non trovato su Google Books) sono ricordati in
 *     RAM per la sessione: evita di martellare l'API a ogni scroll.
 */

import {
    lookupIsbn,
    openLibraryCoverUrl,
    openLibraryCoverViaSearch,
    probeCoverUrl,
    probeOpenLibrary,
    TransientLookupError,
} from './googleBooks';
import { lookupIsbnAnnas, AnnasTransientError } from './annasLookup';

const DB_NAME = 'bookeeper-covers';
// v6: aggiunge fallback Anna's Archive come 3a fonte. Bump per
// invalidare cache vecchie che non hanno il discriminante source nuovo.
const DB_VERSION = 6;
const STORE = 'covers';

interface CoverRecord {
    isbn: string;
    url: string;
    fetchedAt: number;
    source: 'google-books' | 'open-library' | 'annas-archive';
}

// Memo runtime
const memoUrls = new Map<string, string>(); // isbn â†’ url
const inFlight = new Map<string, Promise<string | null>>(); // dedup
const negatives = new Set<string>(); // ISBN noti come "non trovati"

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
            const db = req.result;
            // Schema v1 conteneva blob. Lo droppiamo: v2 memorizza URL.
            if (db.objectStoreNames.contains(STORE)) {
                db.deleteObjectStore(STORE);
            }
            db.createObjectStore(STORE, { keyPath: 'isbn' });
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

function normalizeIsbn(isbn: string): string {
    return isbn.replace(/[^0-9Xx]/g, '').toUpperCase();
}

/**
 * Risolve l'URL di copertina:
 *   1. Google Books → se restituisce un URL, verifichiamo con Image()
 *      che NON sia il placeholder "image not available" 128x192.
 *   2. Fallback Open Library `?default=false` (404 quando manca).
 */
async function fetchCoverUrl(
    isbn: string,
): Promise<
    | { url: string; source: CoverRecord['source'] }
    | null
    | 'transient'
> {
    let transient = false;

    try {
        const info = await lookupIsbn(isbn);
        const candidates = info?.coverCandidates ?? [];
        if (import.meta.env.DEV) {
            console.debug('[coverCache]', isbn, 'candidates:', candidates);
        }
        for (const candidate of candidates) {
            const ok = await probeCoverUrl(candidate);
            if (import.meta.env.DEV) {
                console.debug('[coverCache]', isbn, 'probe', candidate, '=>', ok);
            }
            if (ok) return { url: candidate, source: 'google-books' };
        }
    } catch (e) {
        if (e instanceof TransientLookupError) {
            transient = true;
            if (import.meta.env.DEV) console.debug('[coverCache]', isbn, 'transient lookup err', e.message);
        } else if (import.meta.env.DEV) {
            console.debug('[coverCache]', isbn, 'lookup err', e);
        }
    }

    // Fallback 1: Open Library via ISBN diretto.
    try {
        const ol = openLibraryCoverUrl(isbn);
        const ok = await probeOpenLibrary(ol);
        if (import.meta.env.DEV) console.debug('[coverCache]', isbn, 'OL/isbn probe =>', ok);
        if (ok) return { url: ol, source: 'open-library' };
    } catch (e) {
        if (import.meta.env.DEV) console.debug('[coverCache]', isbn, 'OL/isbn err', e);
    }

    // Fallback 2: Open Library via search.json (cover_i → /b/id/).
    try {
        const olSearch = await openLibraryCoverViaSearch(isbn);
        if (olSearch) {
            const ok = await probeOpenLibrary(olSearch);
            if (import.meta.env.DEV) console.debug('[coverCache]', isbn, 'OL/search probe', olSearch, '=>', ok);
            if (ok) return { url: olSearch, source: 'open-library' };
        }
    } catch (e) {
        if (import.meta.env.DEV) console.debug('[coverCache]', isbn, 'OL/search err', e);
    }

    // Fallback 3: Anna's Archive (solo desktop Wails). Restituisce un
    // URL di copertina di solito ad alta risoluzione (S3/IPFS) anche
    // per edizioni italiane di nicchia che mancano altrove.
    try {
        const aa = await lookupIsbnAnnas(isbn);
        if (aa?.coverUrl) {
            const ok = await probeCoverUrl(aa.coverUrl);
            if (import.meta.env.DEV) console.debug('[coverCache]', isbn, 'AA probe', aa.coverUrl, '=>', ok);
            if (ok) return { url: aa.coverUrl, source: 'annas-archive' };
        }
    } catch (e) {
        if (e instanceof AnnasTransientError) {
            transient = true;
            if (import.meta.env.DEV) console.debug('[coverCache]', isbn, 'AA transient', e.message);
        } else if (import.meta.env.DEV) {
            console.debug('[coverCache]', isbn, 'AA err', e);
        }
    }

    return transient ? 'transient' : null;
}

/**
 * Restituisce un URL pronto per `<img src>` o `null` se la copertina
 * non e' disponibile. Usa cache â†’ fetch â†’ cache.
 */
export async function getCover(rawIsbn: string | null | undefined): Promise<string | null> {
    if (!rawIsbn) return null;
    const isbn = normalizeIsbn(rawIsbn);
    if (isbn.length < 10) return null;

    // Hit memoria
    const memo = memoUrls.get(isbn);
    if (memo) return memo;

    // Negative cache (sessione)
    if (negatives.has(isbn)) return null;

    // Dedup richieste in volo
    const pending = inFlight.get(isbn);
    if (pending) return pending;

    const job = (async () => {
        try {
            // Hit IndexedDB
            const cached = await dbGet(isbn);
            if (cached) {
                memoUrls.set(isbn, cached.url);
                return cached.url;
            }

            // Fetch remoto (Google Books → Open Library fallback)
            const got = await fetchCoverUrl(isbn);
            if (got === null) {
                // Definitivo: ISBN sconosciuto a tutte le fonti.
                negatives.add(isbn);
                return null;
            }
            if (got === 'transient') {
                // Transient (5xx / rete). NON salvare in negative cache:
                // la prossima resolveCover ritenterà (utile dopo refresh
                // o cambio rete). Restituiamo null senza poisoning.
                return null;
            }
            await dbPut({
                isbn,
                url: got.url,
                fetchedAt: Date.now(),
                source: got.source,
            });
            memoUrls.set(isbn, got.url);
            return got.url;
        } catch {
            // Errore di rete / IndexedDB â†’ marca come negativo per la sessione
            negatives.add(isbn);
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

/** Svuota la cache copertine. */
export async function clearCovers(): Promise<void> {
    memoUrls.clear();
    negatives.clear();
    await dbClear();
}

