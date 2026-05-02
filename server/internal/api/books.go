package api

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/bookeeper/bookeeper-neo/server/internal/mw"
)

// BookHandlers is a starter scaffold for the books CRUD surface. It covers
// list + create with FTS5 mirror upkeep so the rest of the system can be
// validated end-to-end. Full filtering / batch / detail handlers will be
// fleshed out in Phase 3 of the roadmap.
type BookHandlers struct {
	DB    *sql.DB
	Audit *mw.Audit
}

type bookDTO struct {
	ID                string   `json:"id"`
	LibraryID         *string  `json:"library_id,omitempty"`
	ISBN13            *string  `json:"isbn_13,omitempty"`
	ISBN10            *string  `json:"isbn_10,omitempty"`
	Title             string   `json:"title"`
	Subtitle          *string  `json:"subtitle,omitempty"`
	Authors           []string `json:"authors"`
	Publisher         *string  `json:"publisher,omitempty"`
	PublishedYear     *int     `json:"published_year,omitempty"`
	Language          *string  `json:"language,omitempty"`
	PageCount         *int     `json:"page_count,omitempty"`
	Description       *string  `json:"description,omitempty"`
	Format            *string  `json:"format,omitempty"`
	Genre             *string  `json:"genre,omitempty"`
	Notes             *string  `json:"notes,omitempty"`
	// ProgressiveNumber: numero d'inventario opzionale, unique per tenant
	// quando valorizzato. Permette di mostrare i libri in ordine fisico
	// e di calcolare il range coperto da ogni scaffale.
	ProgressiveNumber *int     `json:"progressive_number,omitempty"`
	CreatedAt         int64    `json:"created_at"`
	UpdatedAt         int64    `json:"updated_at"`
}

func (h *BookHandlers) List(w http.ResponseWriter, r *http.Request) {
	id, ok := mw.FromContext(r.Context())
	if !ok {
		writeErr(w, http.StatusUnauthorized, "no identity")
		return
	}
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	limit := 200
	if v, _ := strconv.Atoi(r.URL.Query().Get("limit")); v > 0 && v <= 500 {
		limit = v
	}

	var (
		rows *sql.Rows
		err  error
	)
	if q == "" {
		rows, err = h.DB.QueryContext(r.Context(), `
			SELECT id, library_id, isbn_13, isbn_10, title, subtitle, authors_json,
			       publisher, published_year, language, page_count, description,
			       format, genre, notes, progressive_number, created_at, updated_at
			  FROM books WHERE tenant_id = ?
			  ORDER BY created_at DESC
			  LIMIT ?
		`, id.TenantID, limit)
	} else {
		// FTS5 MATCH on the books_fts table; the rowid joins back to books.
		// We sanitize the query: append `*` to enable prefix matching while
		// stripping FTS operators that could break syntax.
		ftsQ := ftsPrefixQuery(q)
		rows, err = h.DB.QueryContext(r.Context(), `
			SELECT b.id, b.library_id, b.isbn_13, b.isbn_10, b.title, b.subtitle, b.authors_json,
			       b.publisher, b.published_year, b.language, b.page_count, b.description,
			       b.format, b.genre, b.notes, b.progressive_number, b.created_at, b.updated_at
			  FROM books_fts f
			  JOIN books b ON b.rowid = f.rowid
			 WHERE b.tenant_id = ? AND books_fts MATCH ?
			 ORDER BY rank
			 LIMIT ?
		`, id.TenantID, ftsQ, limit)
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}
	defer rows.Close()

	out := []bookDTO{}
	for rows.Next() {
		d, err := scanBook(rows)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "scan error")
			return
		}
		out = append(out, d)
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"books": out})
}

// Get returns a single book by id (tenant-scoped).
func (h *BookHandlers) Get(w http.ResponseWriter, r *http.Request) {
	id, ok := mw.FromContext(r.Context())
	if !ok {
		writeErr(w, http.StatusUnauthorized, "no identity")
		return
	}
	bookID := chi.URLParam(r, "id")
	row := h.DB.QueryRowContext(r.Context(), `
		SELECT id, library_id, isbn_13, isbn_10, title, subtitle, authors_json,
		       publisher, published_year, language, page_count, description,
		       format, genre, notes, progressive_number, created_at, updated_at
		  FROM books WHERE id = ? AND tenant_id = ?
	`, bookID, id.TenantID)
	d, err := scanBook(row)
	if err == sql.ErrNoRows {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}
	writeJSON(w, http.StatusOK, d)
}

type createBookReq struct {
	LibraryID         string   `json:"library_id"`
	ISBN13            string   `json:"isbn_13"`
	ISBN10            string   `json:"isbn_10"`
	Title             string   `json:"title"`
	Subtitle          string   `json:"subtitle"`
	Authors           []string `json:"authors"`
	Publisher         string   `json:"publisher"`
	PublishedYear     int      `json:"published_year"`
	Language          string   `json:"language"`
	PageCount         int      `json:"page_count"`
	Description       string   `json:"description"`
	Format            string   `json:"format"`
	Genre             string   `json:"genre"`
	Notes             string   `json:"notes"`
	// ProgressiveNumber: 0 = nessun numero (NULL su DB). Non zero = unique
	// vincolo applicato dall'index parziale; 409 se collide con un altro libro.
	ProgressiveNumber int      `json:"progressive_number"`
}

func (h *BookHandlers) Create(w http.ResponseWriter, r *http.Request) {
	id, ok := mw.FromContext(r.Context())
	if !ok {
		writeErr(w, http.StatusUnauthorized, "no identity")
		return
	}
	var req createBookReq
	if !readJSON(w, r, &req) {
		return
	}
	if strings.TrimSpace(req.Title) == "" {
		writeErr(w, http.StatusBadRequest, "title required")
		return
	}
	authorsJSON, _ := json.Marshal(req.Authors)
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
            description, format, genre, notes, progressive_number, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, bookID, id.TenantID, nullableID(req.LibraryID),
		nullable(req.ISBN13), nullable(req.ISBN10),
		req.Title, nullable(req.Subtitle),
		string(authorsJSON), nullable(req.Publisher),
		nullableInt(req.PublishedYear), nullable(req.Language),
		nullableInt(req.PageCount), nullable(req.Description),
		nullable(req.Format), nullable(req.Genre), nullable(req.Notes),
		nullableInt(req.ProgressiveNumber),
		now, now,
	); err != nil {
		// Index parziale UNIQUE su (tenant_id, progressive_number) genera
		// l'errore SQLite "UNIQUE constraint failed" se il numero e' gia' preso.
		if isUniqueConstraintErr(err) {
			writeErr(w, http.StatusConflict, "progressive_number already in use")
			return
		}
		writeErr(w, http.StatusInternalServerError, "insert failed")
		return
	}

	// Mirror into FTS5.
	authorsTxt := strings.Join(req.Authors, ", ")
	isbnBoth := strings.TrimSpace(req.ISBN13 + " " + req.ISBN10)
	if _, err := tx.ExecContext(r.Context(), `
        INSERT INTO books_fts (rowid, title, subtitle, authors, description, notes, isbn)
        VALUES ((SELECT rowid FROM books WHERE id = ?), ?, ?, ?, ?, ?, ?)
    `, bookID, req.Title, req.Subtitle, authorsTxt, req.Description, req.Notes, isbnBoth); err != nil {
		writeErr(w, http.StatusInternalServerError, "fts mirror failed")
		return
	}
	if err := tx.Commit(); err != nil {
		writeErr(w, http.StatusInternalServerError, "commit failed")
		return
	}

	_ = h.Audit.Write(r.Context(), mw.Event{
		Action: "book.create", EntityType: "book", EntityID: bookID,
		After: req,
	})
	writeJSON(w, http.StatusOK, map[string]string{"id": bookID})
}

// --- helpers ---

// rowScanner abstracts over *sql.Row and *sql.Rows for scanBook.
type rowScanner interface {
	Scan(dest ...interface{}) error
}

func scanBook(s rowScanner) (bookDTO, error) {
	var d bookDTO
	var authorsJSON string
	var libID, isbn13, isbn10, subtitle, publisher, language, description, format, genre, notes sql.NullString
	var publishedYear, pageCount, progressive sql.NullInt64
	if err := s.Scan(&d.ID, &libID, &isbn13, &isbn10, &d.Title, &subtitle, &authorsJSON,
		&publisher, &publishedYear, &language, &pageCount, &description,
		&format, &genre, &notes, &progressive, &d.CreatedAt, &d.UpdatedAt); err != nil {
		return d, err
	}
	_ = json.Unmarshal([]byte(authorsJSON), &d.Authors)
	if d.Authors == nil {
		d.Authors = []string{}
	}
	d.LibraryID = nullToPtr(libID)
	d.ISBN13 = nullToPtr(isbn13)
	d.ISBN10 = nullToPtr(isbn10)
	d.Subtitle = nullToPtr(subtitle)
	d.Publisher = nullToPtr(publisher)
	d.Language = nullToPtr(language)
	d.Description = nullToPtr(description)
	d.Format = nullToPtr(format)
	d.Genre = nullToPtr(genre)
	d.Notes = nullToPtr(notes)
	if publishedYear.Valid {
		v := int(publishedYear.Int64)
		d.PublishedYear = &v
	}
	if pageCount.Valid {
		v := int(pageCount.Int64)
		d.PageCount = &v
	}
	if progressive.Valid {
		v := int(progressive.Int64)
		d.ProgressiveNumber = &v
	}
	return d, nil
}

// ftsPrefixQuery converts a free-form user query into an FTS5 prefix MATCH
// expression. Each whitespace-separated term becomes `term*` so partial
// typing matches; tokens with special characters are quoted.
func ftsPrefixQuery(q string) string {
	parts := strings.Fields(q)
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		// Strip FTS operators that could break the parser.
		p = strings.Map(func(r rune) rune {
			switch r {
			case '"', '*', '(', ')', ':':
				return -1
			}
			return r
		}, p)
		if p == "" {
			continue
		}
		out = append(out, "\""+p+"\"*")
	}
	if len(out) == 0 {
		return ""
	}
	return strings.Join(out, " ")
}

func nullable(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}
func nullableID(s string) interface{} { return nullable(s) }
func nullableInt(n int) interface{} {
	if n == 0 {
		return nil
	}
	return n
}
func nullToPtr(n sql.NullString) *string {
	if !n.Valid {
		return nil
	}
	v := n.String
	return &v
}

// Update modifies a book in place. Body is the same shape as createBookReq.
// Empty fields clear their column; absence requires sending zero values
// explicitly (the client always sends a complete record).
func (h *BookHandlers) Update(w http.ResponseWriter, r *http.Request) {
	id, ok := mw.FromContext(r.Context())
	if !ok {
		writeErr(w, http.StatusUnauthorized, "no identity")
		return
	}
	bookID := chi.URLParam(r, "id")
	var req createBookReq
	if !readJSON(w, r, &req) {
		return
	}
	if strings.TrimSpace(req.Title) == "" {
		writeErr(w, http.StatusBadRequest, "title required")
		return
	}
	authorsJSON, _ := json.Marshal(req.Authors)
	now := time.Now().Unix()

	tx, err := h.DB.BeginTx(r.Context(), nil)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}
	defer func() { _ = tx.Rollback() }()

	res, err := tx.ExecContext(r.Context(), `
		UPDATE books SET
			library_id = ?, isbn_13 = ?, isbn_10 = ?, title = ?, subtitle = ?,
			authors_json = ?, publisher = ?, published_year = ?, language = ?,
			page_count = ?, description = ?, format = ?, genre = ?, notes = ?,
			progressive_number = ?, updated_at = ?
		WHERE id = ? AND tenant_id = ?
	`, nullableID(req.LibraryID), nullable(req.ISBN13), nullable(req.ISBN10),
		req.Title, nullable(req.Subtitle), string(authorsJSON),
		nullable(req.Publisher), nullableInt(req.PublishedYear),
		nullable(req.Language), nullableInt(req.PageCount),
		nullable(req.Description), nullable(req.Format), nullable(req.Genre), nullable(req.Notes),
		nullableInt(req.ProgressiveNumber),
		now, bookID, id.TenantID,
	)
	if err != nil {
		if isUniqueConstraintErr(err) {
			writeErr(w, http.StatusConflict, "progressive_number already in use")
			return
		}
		writeErr(w, http.StatusInternalServerError, "update failed")
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}

	// Refresh FTS row: delete + re-insert is the simplest correct path for
	// a contentless FTS5 table.
	if _, err := tx.ExecContext(r.Context(),
		`DELETE FROM books_fts WHERE rowid = (SELECT rowid FROM books WHERE id = ?)`,
		bookID); err != nil {
		writeErr(w, http.StatusInternalServerError, "fts cleanup failed")
		return
	}
	authorsTxt := strings.Join(req.Authors, ", ")
	isbnBoth := strings.TrimSpace(req.ISBN13 + " " + req.ISBN10)
	if _, err := tx.ExecContext(r.Context(), `
		INSERT INTO books_fts (rowid, title, subtitle, authors, description, notes, isbn)
		VALUES ((SELECT rowid FROM books WHERE id = ?), ?, ?, ?, ?, ?, ?)
	`, bookID, req.Title, req.Subtitle, authorsTxt, req.Description, req.Notes, isbnBoth); err != nil {
		writeErr(w, http.StatusInternalServerError, "fts mirror failed")
		return
	}
	if err := tx.Commit(); err != nil {
		writeErr(w, http.StatusInternalServerError, "commit failed")
		return
	}

	_ = h.Audit.Write(r.Context(), mw.Event{
		Action: "book.update", EntityType: "book", EntityID: bookID, After: req,
	})
	writeJSON(w, http.StatusOK, map[string]string{"id": bookID})
}

// Delete removes a book and its FTS mirror row. Loans/wishlist rows that
// reference it are removed via ON DELETE CASCADE in the schema.
func (h *BookHandlers) Delete(w http.ResponseWriter, r *http.Request) {
	id, ok := mw.FromContext(r.Context())
	if !ok {
		writeErr(w, http.StatusUnauthorized, "no identity")
		return
	}
	bookID := chi.URLParam(r, "id")

	tx, err := h.DB.BeginTx(r.Context(), nil)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}
	defer func() { _ = tx.Rollback() }()

	if _, err := tx.ExecContext(r.Context(),
		`DELETE FROM books_fts WHERE rowid = (SELECT rowid FROM books WHERE id = ? AND tenant_id = ?)`,
		bookID, id.TenantID); err != nil {
		writeErr(w, http.StatusInternalServerError, "fts cleanup failed")
		return
	}
	res, err := tx.ExecContext(r.Context(),
		`DELETE FROM books WHERE id = ? AND tenant_id = ?`,
		bookID, id.TenantID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "delete failed")
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	if err := tx.Commit(); err != nil {
		writeErr(w, http.StatusInternalServerError, "commit failed")
		return
	}

	_ = h.Audit.Write(r.Context(), mw.Event{
		Action: "book.delete", EntityType: "book", EntityID: bookID,
	})
	w.WriteHeader(http.StatusNoContent)
}

// --- Batch & helpers --------------------------------------------------------

type batchIDsReq struct {
	IDs []string `json:"ids"`
}

// BatchDelete rimuove in transazione una lista di libri appartenenti al
// tenant. Eventuali ID inesistenti o di altri tenant vengono ignorati
// silenziosamente (il filtro WHERE tenant_id li scarta) — preferiamo questo
// a un 404 parziale perche' l'operazione e' idempotente lato UI: l'utente
// seleziona checkbox e si aspetta che alla fine quelle righe non ci siano.
//
// Limite difensivo: 500 id per chiamata. Sopra rispondiamo 400 invece di
// far esplodere la prepared statement (SQLite ha un soft cap su parametri).
func (h *BookHandlers) BatchDelete(w http.ResponseWriter, r *http.Request) {
	id, ok := mw.FromContext(r.Context())
	if !ok {
		writeErr(w, http.StatusUnauthorized, "no identity")
		return
	}
	var req batchIDsReq
	if !readJSON(w, r, &req) {
		return
	}
	if len(req.IDs) == 0 {
		writeJSON(w, http.StatusOK, map[string]int{"deleted": 0})
		return
	}
	if len(req.IDs) > 500 {
		writeErr(w, http.StatusBadRequest, "too many ids (max 500)")
		return
	}

	tx, err := h.DB.BeginTx(r.Context(), nil)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}
	defer func() { _ = tx.Rollback() }()

	// IN-clause con placeholder dinamici. tenant_id come ultimo arg.
	placeholders := strings.Repeat("?,", len(req.IDs))
	placeholders = placeholders[:len(placeholders)-1]
	args := make([]interface{}, 0, len(req.IDs)+1)
	for _, x := range req.IDs {
		args = append(args, x)
	}
	args = append(args, id.TenantID)

	// FTS cleanup: cancelliamo prima per via del JOIN su books per rowid.
	if _, err := tx.ExecContext(r.Context(),
		`DELETE FROM books_fts WHERE rowid IN (
			SELECT rowid FROM books WHERE id IN (`+placeholders+`) AND tenant_id = ?
		)`, args...); err != nil {
		writeErr(w, http.StatusInternalServerError, "fts cleanup failed")
		return
	}
	res, err := tx.ExecContext(r.Context(),
		`DELETE FROM books WHERE id IN (`+placeholders+`) AND tenant_id = ?`, args...)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "delete failed")
		return
	}
	n, _ := res.RowsAffected()
	if err := tx.Commit(); err != nil {
		writeErr(w, http.StatusInternalServerError, "commit failed")
		return
	}

	_ = h.Audit.Write(r.Context(), mw.Event{
		Action: "book.batch.delete", EntityType: "book",
		After: map[string]interface{}{"requested": len(req.IDs), "deleted": n},
	})
	writeJSON(w, http.StatusOK, map[string]int64{"deleted": n})
}

// NextProgressive restituisce il prossimo numero progressivo libero per il
// tenant (MAX(progressive_number) + 1, oppure 1 se nessun libro lo ha).
// Usato dal form di creazione per offrire un'auto-suggestion senza
// imporla: l'utente puo' sempre sovrascriverlo o lasciarlo a 0 (= NULL).
func (h *BookHandlers) NextProgressive(w http.ResponseWriter, r *http.Request) {
	id, ok := mw.FromContext(r.Context())
	if !ok {
		writeErr(w, http.StatusUnauthorized, "no identity")
		return
	}
	var maxNum sql.NullInt64
	if err := h.DB.QueryRowContext(r.Context(),
		`SELECT MAX(progressive_number) FROM books WHERE tenant_id = ?`,
		id.TenantID).Scan(&maxNum); err != nil {
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}
	next := 1
	if maxNum.Valid {
		next = int(maxNum.Int64) + 1
	}
	writeJSON(w, http.StatusOK, map[string]int{"next": next})
}

// isUniqueConstraintErr riconosce l'errore SQLite "UNIQUE constraint failed".
// Non importiamo il driver per type-assertion: il messaggio testuale e'
// stabile dal 2009 e funziona con tutti i driver (mattn, modernc, ncruces).
func isUniqueConstraintErr(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	return strings.Contains(msg, "UNIQUE constraint failed") ||
		strings.Contains(msg, "constraint failed: UNIQUE")
}

