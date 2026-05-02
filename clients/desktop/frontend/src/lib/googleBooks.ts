/**
 * googleBooks.ts — query unica all'API Google Books, condivisa tra
 * `coverCache` (solo URL della copertina) e il lookup ISBN del form
 * libri (popola titolo, autori, editore, ...).
 *
 * Tutto client-side, no API key richiesta per query semplici.
 */

export interface GoogleBookInfo {
    title: string;
    subtitle: string;
    authors: string[];
    publisher: string;
    publishedYear: number; // 0 se sconosciuto
    pageCount: number;     // 0 se sconosciuto
    description: string;
    language: string;
    isbn10: string;
    isbn13: string;
    /**
     * Categorie/genere come restituite da Google (BISAC). Tipicamente
     * stringhe gerarchiche ("Fiction / Fantasy / Epic"). Vuota se Google
     * non classifica il volume. Il primo elemento e' usato per popolare
     * il campo `genre` del form.
     */
    categories: string[];
    /** Valutazione media 1-5 (0 = nessuna recensione). */
    averageRating: number;
    /** Numero di recensioni che concorrono a averageRating. */
    ratingsCount: number;
    /** "NOT_MATURE" | "MATURE" | "" (sconosciuto). */
    maturityRating: string;
    /** "BOOK" | "MAGAZINE" | "" (sconosciuto). */
    printType: string;
    /** URL pagina di anteprima su Google Books, se disponibile. */
    previewLink: string;
    /** URL pagina dettagli su Google Books, se disponibile. */
    infoLink: string;
    /**
     * Lista ordinata di URL candidati per la copertina (dal piu' grande
     * al piu' piccolo). Vuota se Google non ha nessun `imageLinks`.
     * Va comunque verificata via `probeCoverUrl` perche' Google a volte
     * restituisce il placeholder 128x192 anche per URL formalmente validi.
     */
    coverCandidates: string[];
}

export function normalizeIsbn(isbn: string): string {
    return isbn.replace(/[^0-9Xx]/g, '').toUpperCase();
}

interface VolumeInfo {
    title?: string;
    subtitle?: string;
    authors?: string[];
    publisher?: string;
    publishedDate?: string;
    pageCount?: number;
    description?: string;
    language?: string;
    industryIdentifiers?: Array<{ type: string; identifier: string }>;
    imageLinks?: Record<string, string>;
    categories?: string[];
    averageRating?: number;
    ratingsCount?: number;
    maturityRating?: string;
    printType?: string;
    previewLink?: string;
    infoLink?: string;
    canonicalVolumeLink?: string;
}

/**
 * Costruisce la lista ordinata di URL candidati per la copertina,
 * dal piu' nitido al piu' piccolo. Per ciascun link presente in
 * `imageLinks` proviamo PRIMA un upscale a zoom=1 (di solito la versione
 * "piena" che Google serve in alta risoluzione) e POI l'URL originale
 * cosi' come ricevuto. In questo modo:
 *   - se Google ha la copertina full, la otteniamo grande;
 *   - se ha solo il thumbnail (zoom=5 / smallThumbnail), evitiamo di
 *     forzare uno zoom inesistente che restituirebbe il placeholder.
 */
function pickCoverCandidates(links: Record<string, string> | undefined): string[] {
    if (!links) return [];
    const ordered = [
        links.extraLarge,
        links.large,
        links.medium,
        links.thumbnail,
        links.smallThumbnail,
    ].filter((u): u is string => Boolean(u));

    const out: string[] = [];
    const seen = new Set<string>();
    for (const raw of ordered) {
        const base = raw
            .replace(/^http:\/\//i, 'https://')
            .replace(/&edge=curl/gi, '');
        // Variante "alta risoluzione" forzando zoom=1 (PNG full-bleed).
        const hi = base.replace(/&zoom=\d+/i, '&zoom=1');
        if (!seen.has(hi)) { seen.add(hi); out.push(hi); }
        // E poi l'URL originale (es. zoom=5 per smallThumbnail).
        if (!seen.has(base)) { seen.add(base); out.push(base); }
    }
    return out;
}

function parseYear(s: string | undefined): number {
    if (!s) return 0;
    const m = s.match(/\d{4}/);
    return m ? Number(m[0]) : 0;
}

/**
 * Errore custom per distinguere fallimenti transienti (rate-limit /
 * 5xx / network) da "non trovato" (404 / nessun item). Il chiamante
 * usa questa distinzione per decidere se mettere l'ISBN in negative
 * cache o lasciarlo riprovabile.
 */
export class TransientLookupError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'TransientLookupError';
    }
}

async function fetchJsonWithRetry(url: string, attempts = 3): Promise<unknown> {
    let lastErr: unknown;
    for (let i = 0; i < attempts; i++) {
        try {
            const r = await fetch(url, { headers: { Accept: 'application/json' } });
            if (r.status >= 500 || r.status === 429) {
                lastErr = new TransientLookupError(`HTTP ${r.status}`);
                // Backoff: 400ms, 1200ms, 3600ms
                await new Promise((res) => setTimeout(res, 400 * Math.pow(3, i)));
                continue;
            }
            if (!r.ok) return null; // 4xx → not found, definitivo
            return await r.json();
        } catch (e) {
            lastErr = e;
            await new Promise((res) => setTimeout(res, 400 * Math.pow(3, i)));
        }
    }
    throw lastErr instanceof Error
        ? new TransientLookupError(lastErr.message)
        : new TransientLookupError('lookup failed');
}

/**
 * Recupera i metadati per un ISBN. Restituisce `null` se l'API non
 * trova alcun volume corrispondente. Lancia `TransientLookupError`
 * se l'API è momentaneamente irraggiungibile (5xx, rete, ecc).
 */
export async function lookupIsbn(rawIsbn: string): Promise<GoogleBookInfo | null> {
    const isbn = normalizeIsbn(rawIsbn);
    if (isbn.length < 10) return null;

    const data = (await fetchJsonWithRetry(
        `https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(isbn)}&maxResults=1&country=IT`,
    )) as { items?: Array<{ volumeInfo?: VolumeInfo }> } | null;
    const v = data?.items?.[0]?.volumeInfo;
    if (!v) return null;

    let isbn10 = '';
    let isbn13 = '';
    for (const id of v.industryIdentifiers ?? []) {
        if (id.type === 'ISBN_10') isbn10 = id.identifier;
        else if (id.type === 'ISBN_13') isbn13 = id.identifier;
    }
    // Fallback: se l'API non rimanda gli identificatori ma sappiamo il
    // formato dell'ISBN cercato, usiamolo per popolare il campo giusto.
    if (!isbn13 && isbn.length === 13) isbn13 = isbn;
    if (!isbn10 && isbn.length === 10) isbn10 = isbn;

    return {
        title: v.title ?? '',
        subtitle: v.subtitle ?? '',
        authors: v.authors ?? [],
        publisher: v.publisher ?? '',
        publishedYear: parseYear(v.publishedDate),
        pageCount: v.pageCount ?? 0,
        description: v.description ?? '',
        language: v.language ?? '',
        isbn10,
        isbn13,
        categories: cleanCategories(v.categories),
        averageRating: v.averageRating ?? 0,
        ratingsCount: v.ratingsCount ?? 0,
        maturityRating: v.maturityRating ?? '',
        printType: v.printType ?? '',
        previewLink: v.previewLink ?? '',
        infoLink: v.infoLink ?? v.canonicalVolumeLink ?? '',
        coverCandidates: pickCoverCandidates(v.imageLinks),
    };
}

/**
 * Normalizza e deduplica le categorie BISAC restituite da Google Books.
 *
 * Google restituisce spesso entries gerarchiche ridondanti, p.es.:
 *   ["Fiction / Fantasy", "Fiction / Fantasy / Epic", "FICTION / Fantasy"]
 *
 * Strategia:
 *   1. Pulizia: trim, collassa whitespace multipli e separatori `/` con
 *      spazi inconsistenti (`Fiction/Fantasy` == `Fiction / Fantasy`).
 *   2. Spezza ogni entry in segmenti via `/` per ottenere il path
 *      gerarchico canonico.
 *   3. Drop ancestor: se "Fiction › Fantasy › Epic" e' presente,
 *      rimuoviamo "Fiction › Fantasy" e "Fiction" perche' impliciti.
 *      Confronto case-insensitive sui segmenti normalizzati.
 *   4. Dedup esatto case-insensitive (gestisce duplicati di casing).
 *   5. Ordinamento: per profondita' decrescente, cosi' `categories[0]`
 *      e' la voce piu' specifica (usata come `genre` nel form).
 *      A parita' di profondita' mantiene l'ordine originale.
 *   6. Render finale: segmenti uniti con " \u203a " (breadcrumb).
 */
function cleanCategories(cats: string[] | undefined): string[] {
    if (!cats || cats.length === 0) return [];

    type Entry = { segments: string[]; key: string; order: number };
    const entries: Entry[] = [];
    const seenKeys = new Set<string>();

    cats.forEach((raw, idx) => {
        if (typeof raw !== 'string') return;
        const segments = raw
            .split('/')
            .map((s) => s.replace(/\s+/g, ' ').trim())
            .filter((s) => s.length > 0);
        if (segments.length === 0) return;
        const key = segments.map((s) => s.toLowerCase()).join('\u0000');
        if (seenKeys.has(key)) return; // dedup esatto post-normalizzazione
        seenKeys.add(key);
        entries.push({ segments, key, order: idx });
    });

    if (entries.length === 0) return [];

    // Drop ancestor: scarta entry che sono prefisso (in segmenti) di un'altra.
    // Pre-calcoliamo i path lower-case con sentinel \u0000 per match esatto
    // sui boundary di segmento (evita falsi positivi tipo "Fan" prefix di "Fantasy").
    const surviving = entries.filter((e) => {
        const prefix = e.key + '\u0000';
        return !entries.some(
            (other) =>
                other !== e &&
                other.segments.length > e.segments.length &&
                (other.key + '\u0000').startsWith(prefix),
        );
    });

    // Ordine: profondita' desc, poi ordine originale (stable sort garantito da V8).
    surviving.sort((a, b) => {
        if (b.segments.length !== a.segments.length) {
            return b.segments.length - a.segments.length;
        }
        return a.order - b.order;
    });

    return surviving.map((e) => e.segments.join(' \u203a '));
}

/**
 * Verifica che un URL puntato a una copertina restituisca un'immagine
 * "vera" e non il placeholder "image not available" di Google Books.
 *
 * Il placeholder di Google e' un PNG di esattamente 128x192 px, identico
 * per tutti gli ISBN senza copertina. Lo rileviamo via `Image()` preload
 * controllando le dimensioni naturali. Le copertine reali a `zoom=2`
 * sono di norma piu' grandi (lato lungo ≥ 256 px) o comunque hanno
 * dimensioni diverse da quel valore esatto.
 */
export function probeCoverUrl(url: string, timeoutMs = 8000): Promise<boolean> {
    return new Promise((resolve) => {
        const img = new Image();
        let done = false;
        const timer = window.setTimeout(() => {
            if (!done) {
                done = true;
                resolve(false);
            }
        }, timeoutMs);
        img.onload = () => {
            if (done) return;
            done = true;
            window.clearTimeout(timer);
            // Placeholder Google Books: 128x192 esatti.
            const isPlaceholder = img.naturalWidth === 128 && img.naturalHeight === 192;
            resolve(!isPlaceholder);
        };
        img.onerror = () => {
            if (done) return;
            done = true;
            window.clearTimeout(timer);
            resolve(false);
        };
        // referrerPolicy abbassa il rischio di 403 da hotlink protection.
        img.referrerPolicy = 'no-referrer';
        img.src = url;
    });
}

/**
 * Fallback Open Library: ritorna URL solo se l'immagine esiste davvero
 * (parametro `default=false` → 404 quando manca, evitando il pixel
 * trasparente 1x1 che e' il default).
 */
export function openLibraryCoverUrl(rawIsbn: string): string {
    const isbn = normalizeIsbn(rawIsbn);
    return `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`;
}

/**
 * Secondo fallback OL: a volte `covers.openlibrary.org/b/isbn/<isbn>`
 * ritorna 404 anche quando la copertina esiste (l'edizione è nota ma
 * non indicizzata su quell'endpoint diretto). Allora interroghiamo
 * `search.json` per ottenere `cover_i` e costruiamo l'URL `/b/id/`.
 */
export async function openLibraryCoverViaSearch(
    rawIsbn: string,
): Promise<string | null> {
    const isbn = normalizeIsbn(rawIsbn);
    if (isbn.length < 10) return null;
    try {
        const r = await fetch(
            `https://openlibrary.org/search.json?isbn=${encodeURIComponent(isbn)}&limit=1`,
            { headers: { Accept: 'application/json' } },
        );
        if (!r.ok) return null;
        const data = (await r.json()) as { docs?: Array<{ cover_i?: number }> };
        const coverId = data.docs?.[0]?.cover_i;
        if (!coverId) return null;
        return `https://covers.openlibrary.org/b/id/${coverId}-L.jpg?default=false`;
    } catch {
        return null;
    }
}

/** Verifica via HEAD-equivalente (Image()) che l'URL Open Library sia valido. */
export function probeOpenLibrary(url: string, timeoutMs = 8000): Promise<boolean> {
    return new Promise((resolve) => {
        const img = new Image();
        let done = false;
        const timer = window.setTimeout(() => {
            if (!done) {
                done = true;
                resolve(false);
            }
        }, timeoutMs);
        img.onload = () => {
            if (done) return;
            done = true;
            window.clearTimeout(timer);
            // OL con default=false: 404 → onerror. Se onload, e' una vera immagine.
            // Misura comunque per scartare eventuali pixel 1x1 residui.
            resolve(img.naturalWidth > 1 && img.naturalHeight > 1);
        };
        img.onerror = () => {
            if (done) return;
            done = true;
            window.clearTimeout(timer);
            resolve(false);
        };
        img.referrerPolicy = 'no-referrer';
        img.src = url;
    });
}
