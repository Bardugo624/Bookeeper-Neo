package api

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"
	"time"

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
	ID            string   `json:"id"`
	LibraryID     *string  `json:"library_id,omitempty"`
	ISBN13        *string  `json:"isbn_13,omitempty"`
	ISBN10        *string  `json:"isbn_10,omitempty"`
	Title         string   `json:"title"`
	Subtitle      *string  `json:"subtitle,omitempty"`
	Authors       []string `json:"authors"`
	Publisher     *string  `json:"publisher,omitempty"`
	PublishedYear *int     `json:"published_year,omitempty"`
	Language      *string  `json:"language,omitempty"`
	PageCount     *int     `json:"page_count,omitempty"`
	Description   *string  `json:"description,omitempty"`
	Format        *string  `json:"format,omitempty"`
	Notes         *string  `json:"notes,omitempty"`
	CreatedAt     int64    `json:"created_at"`
	UpdatedAt     int64    `json:"updated_at"`
}

func (h *BookHandlers) List(w http.ResponseWriter, r *http.Request) {
	id, ok := mw.FromContext(r.Context())
	if !ok {
		writeErr(w, http.StatusUnauthorized, "no identity")
		return
	}
	rows, err := h.DB.QueryContext(r.Context(), `
        SELECT id, library_id, isbn_13, isbn_10, title, subtitle, authors_json,
               publisher, published_year, language, page_count, description,
               format, notes, created_at, updated_at
          FROM books WHERE tenant_id = ?
          ORDER BY created_at DESC
          LIMIT 200
    `, id.TenantID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}
	defer rows.Close()

	out := []bookDTO{}
	for rows.Next() {
		var d bookDTO
		var authorsJSON string
		var libID, isbn13, isbn10, subtitle, publisher, language, description, format, notes sql.NullString
		var publishedYear, pageCount sql.NullInt64
		if err := rows.Scan(&d.ID, &libID, &isbn13, &isbn10, &d.Title, &subtitle, &authorsJSON,
			&publisher, &publishedYear, &language, &pageCount, &description,
			&format, &notes, &d.CreatedAt, &d.UpdatedAt); err != nil {
			writeErr(w, http.StatusInternalServerError, "scan error")
			return
		}
		_ = json.Unmarshal([]byte(authorsJSON), &d.Authors)
		d.LibraryID = nullToPtr(libID)
		d.ISBN13 = nullToPtr(isbn13)
		d.ISBN10 = nullToPtr(isbn10)
		d.Subtitle = nullToPtr(subtitle)
		d.Publisher = nullToPtr(publisher)
		d.Language = nullToPtr(language)
		d.Description = nullToPtr(description)
		d.Format = nullToPtr(format)
		d.Notes = nullToPtr(notes)
		if publishedYear.Valid {
			v := int(publishedYear.Int64)
			d.PublishedYear = &v
		}
		if pageCount.Valid {
			v := int(pageCount.Int64)
			d.PageCount = &v
		}
		out = append(out, d)
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"books": out})
}

type createBookReq struct {
	LibraryID     string   `json:"library_id"`
	ISBN13        string   `json:"isbn_13"`
	ISBN10        string   `json:"isbn_10"`
	Title         string   `json:"title"`
	Subtitle      string   `json:"subtitle"`
	Authors       []string `json:"authors"`
	Publisher     string   `json:"publisher"`
	PublishedYear int      `json:"published_year"`
	Language      string   `json:"language"`
	PageCount     int      `json:"page_count"`
	Description   string   `json:"description"`
	Format        string   `json:"format"`
	Notes         string   `json:"notes"`
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
            description, format, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, bookID, id.TenantID, nullableID(req.LibraryID),
		nullable(req.ISBN13), nullable(req.ISBN10),
		req.Title, nullable(req.Subtitle),
		string(authorsJSON), nullable(req.Publisher),
		nullableInt(req.PublishedYear), nullable(req.Language),
		nullableInt(req.PageCount), nullable(req.Description),
		nullable(req.Format), nullable(req.Notes),
		now, now,
	); err != nil {
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
