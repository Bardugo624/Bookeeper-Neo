package api

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/bookeeper/bookeeper-neo/server/internal/annas"
)

// LookupHandlers espone endpoint read-only verso fonti di metadata
// pubbliche (al momento: Anna's Archive). Funziona da proxy server-side
// per i client browser/mobile che non possono fare scraping cross-origin.
//
// Caratteristiche:
//   - rate limit centralizzato a livello di provider (annas.Provider) →
//     impedisce di far esplodere AA con troppe richieste concorrenti;
//   - cache di sessione del processo (sufficiente per un server
//     domestico — se in futuro vogliamo persistenza, va su sqlite).
type LookupHandlers struct {
	annas *annas.Provider
}

// NewLookupHandlers crea l'istanza condivisa dei provider esterni.
// userAgent dovrebbe essere "Bookeeper/<version> (+url-progetto)".
func NewLookupHandlers(userAgent string) *LookupHandlers {
	return &LookupHandlers{annas: annas.New(userAgent)}
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
