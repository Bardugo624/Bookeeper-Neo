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

import { probeCoverUrl, probeOpenLibrary } from './googleBooks';
import { lookupMetadata, MetadataTransientError, normalizeIsbn as normalizeIsbnUnified } from './metadataLookup';

const DB_NAME = 'bookeeper-covers';
// v8: il filtro placeholder di GoogleBooks e' stato esteso a tutte le
// immagini larghe <=128 px (non piu' solo l'esatto 128x192) e il
// server scarta i record GB metadata-only privi di varianti grandi.
// Le voci v7 in cache potevano contenere thumbnail GB sbagliati per
// edizioni che invece hanno la copertina corretta su OpenLibrary
// (cfr. ISBN 9788804406839 → "Neanche gli dei" di Asimov). Bump per
// forzare il refresh.
const DB_VERSION = 8;
const STORE = 'covers';

interface CoverRecord {
    isbn: string;
    url: string;
    fetchedAt: number;
    // `source` resta libero: il server ce lo dice a parole nel campo
    // `sources` della risposta, ma noi qui salviamo solo il primo che
    // ha passato la probe (nome del provider o "unknown" per fallback).
    source: string;
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
    return normalizeIsbnUnified(isbn);
}

/**
 * Risolve l'URL di copertina chiedendo al server l'array
 * `coverCandidates` (gia' ordinato per priorita' di sorgente) e
 * probando uno per uno con `<img>` finche' non ne carica uno
 * "vero" (no placeholder, no 404).
 *
 * Restituisce:
 *   - `{url, source}` se almeno un candidato ha caricato;
 *   - `null` se la lookup ha detto "no record" o tutti i candidati
 *     hanno fallito → ISBN da mettere in negative cache;
 *   - `'transient'` se la lookup ha fallito in modo recuperabile
 *     (rete, fonti giu') → NON mettere in negative cache.
 */
async function fetchCoverUrl(
    isbn: string,
): Promise<{ url: string; source: string } | null | 'transient'> {
    let info: Awaited<ReturnType<typeof lookupMetadata>> = null;
    try {
        info = await lookupMetadata(isbn);
    } catch (e) {
        if (e instanceof MetadataTransientError) {
            if (import.meta.env.DEV) console.debug('[coverCache]', isbn, 'lookup transient', e.message);
            return 'transient';
        }
        if (import.meta.env.DEV) console.debug('[coverCache]', isbn, 'lookup err', e);
        return 'transient';
    }
    if (!info) return null;

    // L'ordine di `coverCandidates` rispetta la precedenza dei
    // provider lato server: GoogleBooks (zoom=1 + originale) →
    // AnnasArchive → OpenLibrary (large/medium/small + fallback by
    // ISBN). Ci limitiamo a provarli in sequenza.
    const candidates = info.coverCandidates ?? [];
    if (import.meta.env.DEV) {
        console.debug('[coverCache]', isbn, 'candidates:', candidates);
    }
    for (const url of candidates) {
        // OpenLibrary va probata diversamente da Google: il primo non
        // emette CORS e una <img> con onload basta; OL invece torna
        // 200 anche per i placeholder a meno che non si forzi
        // `?default=false` (gia' fatto server-side).
        const isOL = /covers\.openlibrary\.org/.test(url);
        const ok = isOL ? await probeOpenLibrary(url) : await probeCoverUrl(url);
        if (import.meta.env.DEV) console.debug('[coverCache]', isbn, 'probe', url, '=>', ok);
        if (ok) {
            // Source label: deduciamo dal dominio (sufficiente per
            // statistiche/debug; il record non viene letto altrove).
            const source = isOL
                ? 'open-library'
                : /books\.google/.test(url)
                  ? 'google-books'
                  : info.sources?.[0] ?? 'unknown';
            return { url, source };
        }
    }
    return null;
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

