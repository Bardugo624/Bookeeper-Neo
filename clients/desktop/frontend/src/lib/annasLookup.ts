/**
 * annasLookup.ts — wrapper sul binding Wails `LookupIsbnAnnas` esposto
 * dal Go side. E' il fallback finale dopo Google Books e Open Library
 * sia per il lookup metadati (form libro) sia per le copertine.
 *
 * NB: il binding esiste SOLO quando l'app gira dentro Wails (build
 * desktop). In `vite dev` puro (`npm run dev` da frontend/) `window.go`
 * non e' definito → ritorniamo null senza errore. La normale via di
 * sviluppo desktop e' `wails dev`, dove invece e' presente.
 */

import { LookupIsbnAnnas as wailsLookup } from '../../wailsjs/go/main/App';
import type { main } from '../../wailsjs/go/models';

export interface AnnasInfo {
    title: string;
    subtitle: string;
    authors: string[];
    publisher: string;
    publishYear: number;
    pageCount: number;
    language: string;
    description: string;
    isbn10: string;
    isbn13: string;
    coverUrl: string;
    sourceUrl: string;
}

function isWailsAvailable(): boolean {
    // Wails imposta `window.go` con i bindings generati. In dev puro e'
    // assente → ci asteniamo silenziosamente.
    const w = window as unknown as { go?: { main?: { App?: { LookupIsbnAnnas?: unknown } } } };
    return typeof w.go?.main?.App?.LookupIsbnAnnas === 'function';
}

/**
 * Recupera metadati + URL copertina da Anna's Archive per un ISBN.
 *
 * Politica:
 *   - se Wails non e' disponibile (dev SPA), ritorna null;
 *   - su 404 logico ritorna null (campi vuoti dal Go side);
 *   - su errore transiente (rete / Cloudflare) PROPAGA l'errore cosi'
 *     il chiamante puo' decidere se ritentare / non poisonare la
 *     negative cache.
 *
 * Errore TRANSIENT: throw new Error('annas: transient ...').
 * Errore DEFINITIVO (404): return null.
 */
export async function lookupIsbnAnnas(rawIsbn: string): Promise<AnnasInfo | null> {
    if (!isWailsAvailable()) return null;
    const isbn = (rawIsbn ?? '').replace(/[^0-9Xx]/g, '');
    if (isbn.length !== 10 && isbn.length !== 13) return null;

    let res: main.AnnasInfo;
    try {
        res = await wailsLookup(isbn);
    } catch (e) {
        // Tutti gli errori restituiti dal Go side qui (incluso ErrTransient)
        // arrivano come exception JS: mappiamo a TransientLookupError-like.
        const msg = e instanceof Error ? e.message : String(e);
        throw new AnnasTransientError(msg);
    }

    // Convenzione Go side: struct vuota = "non trovato".
    if (!res.title && !res.coverUrl) return null;

    return {
        title: res.title ?? '',
        subtitle: res.subtitle ?? '',
        authors: res.authors ?? [],
        publisher: res.publisher ?? '',
        publishYear: res.publishYear ?? 0,
        pageCount: res.pageCount ?? 0,
        language: res.language ?? '',
        description: res.description ?? '',
        isbn10: res.isbn10 ?? '',
        isbn13: res.isbn13 ?? '',
        coverUrl: res.coverUrl ?? '',
        sourceUrl: res.sourceUrl ?? '',
    };
}

/**
 * Errore distinto per fallimenti transienti del provider Anna's
 * Archive — coerente con `TransientLookupError` di googleBooks.ts.
 */
export class AnnasTransientError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'AnnasTransientError';
    }
}
