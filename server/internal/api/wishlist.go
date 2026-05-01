package api

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/bookeeper/bookeeper-neo/server/internal/mw"
)

// WishlistHandlers expone CRUD sulla wishlist condivisa di una famiglia
// (scope: tenant_id) con attribuzione all'utente che ha aggiunto la voce.
// Schema: vedi 20260501000001_initial.sql tabella `wishlist`.
//
// Convert: collega il flusso "wishlist → libreria" creando una riga in
// `books` partendo dai dati della wishlist e cancellando la voce in una
// singola transazione (atomico).
type WishlistHandlers struct {
	DB    *sql.DB
	Audit *mw.Audit
}

const (
	wishlistPriorityMin = 0
	wishlistPriorityMax = 2
)

type wishlistDTO struct {
	ID        string  `json:"id"`
	UserID    string  `json:"user_id"`
	ISBN      *string `json:"isbn,omitempty"`
	Title     string  `json:"title"`
	Authors   *string `json:"authors,omitempty"`
	SourceURL *string `json:"source_url,omitempty"`
	Priority  int     `json:"priority"`
	Notes     *string `json:"notes,omitempty"`
	CreatedAt int64   `json:"created_at"`
}

type wishlistReq struct {
	ISBN      string `json:"isbn"`
	Title     string `json:"title"`
	Authors   string `json:"authors"`
	SourceURL string `json:"source_url"`
	Priority  int    `json:"priority"`
	Notes     string `json:"notes"`
}

func (h *WishlistHandlers) List(w http.ResponseWriter, r *http.Request) {
	id, ok := mw.FromContext(r.Context())
	if !ok {
		writeErr(w, http.StatusUnauthorized, "no identity")
		return
	}
	rows, err := h.DB.QueryContext(r.Context(), `
		SELECT id, user_id, isbn, title, authors, source_url, priority, notes, created_at
		  FROM wishlist
		 WHERE tenant_id = ?
		 ORDER BY priority DESC, created_at DESC
	`, id.TenantID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}
	defer rows.Close()
	out := []wishlistDTO{}
	for rows.Next() {
		d, err := scanWishlist(rows)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "scan error")
			return
		}
		out = append(out, d)
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"items": out})
}

func (h *WishlistHandlers) Create(w http.ResponseWriter, r *http.Request) {
	id, ok := mw.FromContext(r.Context())
	if !ok {
		writeErr(w, http.StatusUnauthorized, "no identity")
		return
	}
	var req wishlistReq
	if !readJSON(w, r, &req) {
		return
	}
	if msg := validateWishlistReq(&req); msg != "" {
		writeErr(w, http.StatusBadRequest, msg)
		return
	}
	itemID := uuid.NewString()
	now := time.Now().Unix()
	if _, err := h.DB.ExecContext(r.Context(), `
		INSERT INTO wishlist (id, tenant_id, user_id, isbn, title, authors, source_url, priority, notes, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, itemID, id.TenantID, id.UserID,
		nullable(req.ISBN), req.Title,
		nullable(req.Authors), nullable(req.SourceURL),
		req.Priority, nullable(req.Notes), now); err != nil {
		writeErr(w, http.StatusInternalServerError, "insert failed")
		return
	}
	_ = h.Audit.Write(r.Context(), mw.Event{
		Action: "wishlist.create", EntityType: "wishlist", EntityID: itemID, After: req,
	})
	writeJSON(w, http.StatusOK, map[string]string{"id": itemID})
}

func (h *WishlistHandlers) Update(w http.ResponseWriter, r *http.Request) {
	id, ok := mw.FromContext(r.Context())
	if !ok {
		writeErr(w, http.StatusUnauthorized, "no identity")
		return
	}
	itemID := chi.URLParam(r, "id")
	var req wishlistReq
	if !readJSON(w, r, &req) {
		return
	}
	if msg := validateWishlistReq(&req); msg != "" {
		writeErr(w, http.StatusBadRequest, msg)
		return
	}
	res, err := h.DB.ExecContext(r.Context(), `
		UPDATE wishlist
		   SET isbn = ?, title = ?, authors = ?, source_url = ?, priority = ?, notes = ?
		 WHERE id = ? AND tenant_id = ?
	`, nullable(req.ISBN), req.Title, nullable(req.Authors),
		nullable(req.SourceURL), req.Priority, nullable(req.Notes),
		itemID, id.TenantID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "update failed")
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	_ = h.Audit.Write(r.Context(), mw.Event{
		Action: "wishlist.update", EntityType: "wishlist", EntityID: itemID, After: req,
	})
	writeJSON(w, http.StatusOK, map[string]string{"id": itemID})
}

func (h *WishlistHandlers) Delete(w http.ResponseWriter, r *http.Request) {
	id, ok := mw.FromContext(r.Context())
	if !ok {
		writeErr(w, http.StatusUnauthorized, "no identity")
		return
	}
	itemID := chi.URLParam(r, "id")
	res, err := h.DB.ExecContext(r.Context(),
		`DELETE FROM wishlist WHERE id = ? AND tenant_id = ?`, itemID, id.TenantID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "delete failed")
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	_ = h.Audit.Write(r.Context(), mw.Event{
		Action: "wishlist.delete", EntityType: "wishlist", EntityID: itemID,
	})
	w.WriteHeader(http.StatusNoContent)
}

// Convert promuove una voce di wishlist in un libro reale: crea la riga in
// `books` (mirror in books_fts) e cancella la voce dalla wishlist in una
// transazione atomica. Idempotenza: se la voce non esiste o appartiene ad
// altro tenant ritorna 404 senza creare nulla.
func (h *WishlistHandlers) Convert(w http.ResponseWriter, r *http.Request) {
	id, ok := mw.FromContext(r.Context())
	if !ok {
		writeErr(w, http.StatusUnauthorized, "no identity")
		return
	}
	itemID := chi.URLParam(r, "id")

	// Carica voce sotto tenant scope.
	var (
		isbn, authors, sourceURL, notes sql.NullString
		title                           string
	)
	err := h.DB.QueryRowContext(r.Context(), `
		SELECT isbn, title, authors, source_url, notes
		  FROM wishlist WHERE id = ? AND tenant_id = ?
	`, itemID, id.TenantID).Scan(&isbn, &title, &authors, &sourceURL, &notes)
	if err == sql.ErrNoRows {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}

	// Authors free-text → array (split su virgola/newline come nel form libri).
	authorsArr := splitAuthors(authors.String)
	authorsJSON, _ := json.Marshal(authorsArr)
	authorsTxt := strings.Join(authorsArr, ", ")

	bookID := uuid.NewString()
	now := time.Now().Unix()

	tx, err := h.DB.BeginTx(r.Context(), nil)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}
	defer func() { _ = tx.Rollback() }()

	if _, err := tx.ExecContext(r.Context(), `
		INSERT INTO books (
			id, tenant_id, library_id, isbn_13, isbn_10, title, subtitle,
			authors_json, publisher, published_year, language, page_count,
			description, format, notes, created_at, updated_at
		) VALUES (?, ?, NULL, ?, NULL, ?, NULL, ?, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?, ?)
	`, bookID, id.TenantID, nullable(isbn.String), title,
		string(authorsJSON), nullable(notes.String), now, now); err != nil {
		writeErr(w, http.StatusInternalServerError, "insert book failed")
		return
	}

	if _, err := tx.ExecContext(r.Context(), `
		INSERT INTO books_fts (rowid, title, subtitle, authors, description, notes, isbn)
		VALUES ((SELECT rowid FROM books WHERE id = ?), ?, '', ?, '', ?, ?)
	`, bookID, title, authorsTxt, notes.String, isbn.String); err != nil {
		writeErr(w, http.StatusInternalServerError, "fts mirror failed")
		return
	}

	if _, err := tx.ExecContext(r.Context(),
		`DELETE FROM wishlist WHERE id = ? AND tenant_id = ?`,
		itemID, id.TenantID); err != nil {
		writeErr(w, http.StatusInternalServerError, "wishlist delete failed")
		return
	}

	if err := tx.Commit(); err != nil {
		writeErr(w, http.StatusInternalServerError, "commit failed")
		return
	}

	_ = h.Audit.Write(r.Context(), mw.Event{
		Action: "wishlist.convert", EntityType: "wishlist", EntityID: itemID,
		After: map[string]string{"book_id": bookID, "title": title},
	})
	// Audit anche il book.create derivato per coerenza con il flusso libri.
	_ = h.Audit.Write(r.Context(), mw.Event{
		Action: "book.create", EntityType: "book", EntityID: bookID,
		After: map[string]string{"source": "wishlist", "wishlist_id": itemID},
	})
	writeJSON(w, http.StatusOK, map[string]string{
		"id":      itemID,
		"book_id": bookID,
	})
	_ = sourceURL // riservato: future nota cronologica
}

// --- helpers ---

func scanWishlist(s rowScanner) (wishlistDTO, error) {
	var d wishlistDTO
	var isbn, authors, sourceURL, notes sql.NullString
	if err := s.Scan(&d.ID, &d.UserID, &isbn, &d.Title, &authors,
		&sourceURL, &d.Priority, &notes, &d.CreatedAt); err != nil {
		return d, err
	}
	d.ISBN = nullToPtr(isbn)
	d.Authors = nullToPtr(authors)
	d.SourceURL = nullToPtr(sourceURL)
	d.Notes = nullToPtr(notes)
	return d, nil
}

func validateWishlistReq(req *wishlistReq) string {
	req.Title = strings.TrimSpace(req.Title)
	if req.Title == "" {
		return "title required"
	}
	if req.Priority < wishlistPriorityMin || req.Priority > wishlistPriorityMax {
		return "priority out of range"
	}
	req.ISBN = strings.TrimSpace(req.ISBN)
	req.Authors = strings.TrimSpace(req.Authors)
	req.SourceURL = strings.TrimSpace(req.SourceURL)
	req.Notes = strings.TrimSpace(req.Notes)
	return ""
}

// splitAuthors converte una stringa libera in array, separando su virgola
// o newline e scartando elementi vuoti (mirror del parsing frontend).
func splitAuthors(raw string) []string {
	if strings.TrimSpace(raw) == "" {
		return []string{}
	}
	parts := strings.FieldsFunc(raw, func(r rune) bool {
		return r == ',' || r == '\n' || r == ';'
	})
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		t := strings.TrimSpace(p)
		if t != "" {
			out = append(out, t)
		}
	}
	return out
}
