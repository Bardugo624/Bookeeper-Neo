/**
 * metadataLookup — wrapper sottile attorno al binding Wails
 * `LookupMetadata`. Sostituisce il vecchio fan-out client-side
 * (Google Books → OpenLibrary → Anna's Archive) con un'unica chiamata
 * al server, che orchestra le stesse fonti con cache 30g.
 *
 * Vantaggi:
 *  - parita' totale tra desktop, mobile e cover-cache (stesso shape);
 *  - nessuna richiesta CORS dal browser embedded di Wails;
 *  - rate-limit + dedup centralizzato.
 *
 * Fallback offline: il binding Go cade automaticamente sul provider
 * locale Anna's Archive se la sessione mTLS non e' attiva — il chiamante
 * non deve preoccuparsene.
 */
import { LookupMetadata as wailsLookupMetadata } from '../../wailsjs/go/main/App';
import type { main } from '../../wailsjs/go/models';

export type MetadataInfo = main.MetadataInfo;

/** Errore transiente (rete / fonte momentaneamente giu'). I chiamanti
 * NON devono memorizzarlo come "non trovato". */
export class MetadataTransientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MetadataTransientError';
  }
}

/** Normalizza un ISBN: strip di tutto cio' che non e' cifra/X. Identica
 * implementazione a server (lookup.NormalizeISBN) per evitare drift. */
export function normalizeIsbn(s: string): string {
  return (s || '').replace(/[^0-9Xx]/g, '').toUpperCase();
}

/**
 * Lookup unificato. Ritorna `null` per "definitivamente non trovato"
 * (i chiamanti possono mettere in negative cache); rilancia
 * MetadataTransientError per fallimenti recuperabili.
 */
export async function lookupMetadata(rawIsbn: string): Promise<MetadataInfo | null> {
  const isbn = normalizeIsbn(rawIsbn);
  if (isbn.length !== 10 && isbn.length !== 13) {
    throw new Error('ISBN deve essere 10 o 13 cifre');
  }
  try {
    const res = await wailsLookupMetadata(isbn);
    // Backend ritorna struct azzerata per "non trovato".
    if (!res || (!res.title && (!res.coverCandidates || res.coverCandidates.length === 0) && !res.coverUrl)) {
      return null;
    }
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Heuristica simmetrica a app.go isHTTPNotFound: 404 e' un "no
    // record" definitivo, NON un transiente.
    if (/\b404\b/.test(msg) || /not found/i.test(msg) || /non trovato/i.test(msg)) {
      return null;
    }
    throw new MetadataTransientError(msg);
  }
}
