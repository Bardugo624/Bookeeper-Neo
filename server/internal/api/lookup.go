package api

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/bookeeper/bookeeper-neo/server/internal/annas"
	"github.com/bookeeper/bookeeper-neo/server/internal/lookup"
)

// LookupHandlers espone endpoint read-only verso fonti di metadata
// pubbliche. Da Bookeeper 0.6 unifichiamo tutte le fonti dietro
// `lookup.Service` in modo che desktop, mobile e cover-fetch ricevano
// lo stesso shape e la stessa precedenza di provider — vedi
// server/internal/lookup/lookup.go.
//
// Caratteristiche:
//   - rate limit interno a ciascun provider (es. annas.Provider) →
//     impedisce di far esplodere le sorgenti con troppe richieste;
//   - cache di processo a livello di Service (positivi 30g, negativi 24h).
//
// L'endpoint legacy /lookup/annas/{isbn} resta come thin shim che chiama
// solo il provider Anna's Archive (per compatibilita' con vecchi
// installer desktop ancora attivi); il nuovo /lookup/metadata/{isbn} e'
// quello canonico verso cui tutti i client devono migrare.
type LookupHandlers struct {
	annas    *annas.Provider
	metadata *lookup.Service
}

// NewLookupHandlers crea l'istanza condivisa dei provider esterni.
// userAgent dovrebbe essere "Bookeeper/<version> (+url-progetto)".
func NewLookupHandlers(userAgent string) *LookupHandlers {
	return &LookupHandlers{
		annas:    annas.New(userAgent),
		metadata: lookup.New(userAgent, 12*time.Second),
	}
}

// AnnasResponse e' lo shape JSON ritornato a /lookup/annas/{isbn}.
// Mantiene gli stessi nomi del Wails binding lato desktop cosi' la
// frontend mobile-web puo' riusare lo stesso parser.
type AnnasResponse struct {
	Title       string   `json:"title"`
	Subtitle    string   `json:"subtitle"`
	Authors     []string `json:"authors"`
	Publisher   string   `json:"publisher"`
	PublishYear int      `json:"publishYear"`
	PageCount   int      `json:"pageCount"`
	Language    string   `json:"language"`
	Description string   `json:"description"`
	ISBN10      string   `json:"isbn10"`
	ISBN13      string   `json:"isbn13"`
	CoverURL    string   `json:"coverUrl"`
	SourceURL   string   `json:"sourceUrl"`
}

// LookupAnnasISBN gestisce GET /lookup/annas/{isbn}.
// Risposte:
//   - 200 + AnnasResponse → trovato
//   - 404 + errResp       → ISBN sconosciuto a tutte le fonti AA
//   - 503 + errResp       → fonte temporaneamente irraggiungibile
//   - 400 + errResp       → ISBN malformato
func (h *LookupHandlers) LookupAnnasISBN(w http.ResponseWriter, r *http.Request) {
	raw := strings.TrimSpace(chi.URLParam(r, "isbn"))
	if raw == "" {
		writeErr(w, http.StatusBadRequest, "isbn mancante")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 18*time.Second)
	defer cancel()

	info, err := h.annas.Lookup(ctx, raw)
	if errors.Is(err, annas.ErrTransient) || (err != nil && !errors.Is(err, context.Canceled)) {
		// Cache-Control breve: client puo' ritentare presto.
		w.Header().Set("Cache-Control", "no-store")
		writeErr(w, http.StatusServiceUnavailable, "fonte momentaneamente non disponibile")
		return
	}
	if info == nil {
		// 404 logico: l'ISBN non esiste in AA. Cachiamo lato client per
		// un giorno cosi' non martelliamo l'endpoint.
		w.Header().Set("Cache-Control", "public, max-age=86400")
		writeErr(w, http.StatusNotFound, "isbn non trovato")
		return
	}

	// Hit positivo: cache 30 giorni lato browser/CDN. Il cover URL puo'
	// scadere ma quando fallira' il client rifara' la GET.
	w.Header().Set("Cache-Control", "public, max-age=2592000")
	writeJSON(w, http.StatusOK, AnnasResponse{
		Title:       info.Title,
		Subtitle:    info.Subtitle,
		Authors:     info.Authors,
		Publisher:   info.Publisher,
		PublishYear: info.PublishYear,
		PageCount:   info.PageCount,
		Language:    info.Language,
		Description: info.Description,
		ISBN10:      info.ISBN10,
		ISBN13:      info.ISBN13,
		CoverURL:    info.CoverURL,
		SourceURL:   info.SourceURL,
	})
}

// LookupMetadata gestisce GET /lookup/metadata/{isbn} — l'endpoint
// canonico unificato per metadata + cover URLs. Aggrega GoogleBooks,
// Anna's Archive e OpenLibrary lato server e ritorna un singolo
// `lookup.Metadata` con sorgenti deduplicate.
//
// Risposte:
//   - 200 + Metadata → almeno una fonte ha dati
//   - 404 + errResp  → tutte le fonti hanno detto "no record"
//   - 503 + errResp  → tutte le fonti hanno fallito in modo transiente
//   - 400 + errResp  → ISBN malformato
func (h *LookupHandlers) LookupMetadata(w http.ResponseWriter, r *http.Request) {
	raw := strings.TrimSpace(chi.URLParam(r, "isbn"))
	if raw == "" {
		writeErr(w, http.StatusBadRequest, "isbn mancante")
		return
	}
	isbn := lookup.NormalizeISBN(raw)
	if len(isbn) != 10 && len(isbn) != 13 {
		writeErr(w, http.StatusBadRequest, "isbn deve essere 10 o 13 cifre")
		return
	}

	// Budget complessivo: ogni provider ha gia' il proprio timeout (~12s),
	// ma con tre fonti in serie diamo al chiamante un tetto piu' generoso.
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	info, err := h.metadata.Lookup(ctx, isbn)
	if err != nil {
		if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
			w.Header().Set("Cache-Control", "no-store")
			writeErr(w, http.StatusServiceUnavailable, "lookup timeout")
			return
		}
		w.Header().Set("Cache-Control", "no-store")
		writeErr(w, http.StatusServiceUnavailable, "fonti momentaneamente non disponibili")
		return
	}
	if info == nil {
		// Definitive miss: caching breve lato client per non rimartellare
		// l'endpoint scrollando una lista di ISBN ignoti.
		w.Header().Set("Cache-Control", "public, max-age=86400")
		writeErr(w, http.StatusNotFound, "isbn non trovato")
		return
	}
	w.Header().Set("Cache-Control", "public, max-age=2592000")
	writeJSON(w, http.StatusOK, info)
}
