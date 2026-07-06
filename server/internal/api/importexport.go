package api

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/bookeeper/bookeeper-neo/server/internal/mw"
)

// Import/Export: il gancio di adozione (roadmap 1.1).
//
// L'import accetta il CONTENUTO del file come stringa JSON (niente multipart):
// il client desktop legge il file via dialog nativo e lo inoltra. I CSV di
// export delle librerie personali sono al massimo qualche MB, ampiamente nel
// budget di una request. Formati supportati:
//
//   - goodreads   → CSV export ufficiale (colonne "Title", "ISBN13", ...)
//   - calibre     → CSV da `calibredb catalog` / "Convert to CSV"
//   - librarything→ TSV export (colonne "TITLE", "PRIMARY AUTHOR", ...)
//   - auto        → sniffing dell'header
//
// Dedupe: per ISBN (13 o 10, normalizzato) contro i libri già presenti nel
// tenant e all'interno del file stesso. I record senza ISBN vengono sempre
// importati (non c'è chiave affidabile per dedupe).
// ponytail: niente Calibre metadata.db (richiederebbe upload di uno SQLite
// binario); il CSV di Calibre copre lo stesso caso d'uso.

type importReq struct {
	Format  string `json:"format"` // auto|goodreads|calibre|librarything
	Content string `json:"content"`
	DryRun  bool   `json:"dry_run"`
}

// importedBook è il record normalizzato prodotto dai parser.
type importedBook struct {
	Title     string   `json:"title"`
	Authors   []string `json:"authors"`
	ISBN13    string   `json:"isbn_13,omitempty"`
	ISBN10    string   `json:"isbn_10,omitempty"`
	Publisher string   `json:"publisher,omitempty"`
	Year      int      `json:"published_year,omitempty"`
	Pages     int      `json:"page_count,omitempty"`
	Language  string   `json:"language,omitempty"`
	Format    string   `json:"format,omitempty"`
	Notes     string   `json:"notes,omitempty"`
}

type importResp struct {
	Format     string         `json:"format"`
	Total      int            `json:"total"`
	New        int            `json:"new"`
	Duplicates int            `json:"duplicates"`
	Invalid    int            `json:"invalid"`
	Imported   int            `json:"imported"`
	Preview    []importedBook `json:"preview"`
	Errors     []string       `json:"errors"`
}

const maxImportBytes = 32 << 20 // 32 MB: ben oltre qualsiasi export reale

// Import gestisce POST /api/v1/import (dry-run e commit).
func (h *BookHandlers) Import(w http.ResponseWriter, r *http.Request) {
	id, ok := mw.FromContext(r.Context())
	if !ok {
		writeErr(w, http.StatusUnauthorized, "no identity")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxImportBytes)
	var req importReq
	if !readJSON(w, r, &req) {
		return
	}
	if strings.TrimSpace(req.Content) == "" {
		writeErr(w, http.StatusBadRequest, "empty content")
		return
	}

	format := strings.ToLower(strings.TrimSpace(req.Format))
	if format == "" || format == "auto" {
		format = detectImportFormat(req.Content)
	}
	if format == "" {
		writeErr(w, http.StatusBadRequest, "unrecognized format")
		return
	}

	books, errs, err := parseImport(format, req.Content)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "parse failed: "+err.Error())
		return
	}

	// ISBN già presenti nel tenant (13 e 10 in un unico set).
	existing := map[string]bool{}
	rows, err := h.DB.QueryContext(r.Context(),
		`SELECT isbn_13, isbn_10 FROM books WHERE tenant_id = ?`, id.TenantID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}
	for rows.Next() {
		var i13, i10 *string
		if err := rows.Scan(&i13, &i10); err != nil {
			rows.Close()
			writeErr(w, http.StatusInternalServerError, "scan error")
			return
		}
		if i13 != nil && *i13 != "" {
			existing[*i13] = true
		}
		if i10 != nil && *i10 != "" {
			existing[*i10] = true
		}
	}
	rows.Close()

	resp := importResp{Format: format, Total: len(books), Errors: errs, Preview: []importedBook{}}
	if resp.Errors == nil {
		resp.Errors = []string{}
	}
	toInsert := make([]importedBook, 0, len(books))
	seen := map[string]bool{} // dedupe intra-file
	for _, b := range books {
		key := b.ISBN13
		if key == "" {
			key = b.ISBN10
		}
		if key != "" && (existing[key] || seen[key]) {
			resp.Duplicates++
			continue
		}
		if key != "" {
			seen[key] = true
		}
		toInsert = append(toInsert, b)
	}
	resp.New = len(toInsert)
	if n := len(toInsert); n > 0 {
		if n > 20 {
			n = 20
		}
		resp.Preview = toInsert[:n]
	}

	if req.DryRun {
		writeJSON(w, http.StatusOK, resp)
		return
	}

	tx, err := h.DB.BeginTx(r.Context(), nil)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}
	defer func() { _ = tx.Rollback() }()
	now := time.Now().Unix()
	for _, b := range toInsert {
		bookID := uuid.NewString()
		authorsJSON, _ := json.Marshal(b.Authors)
		if _, err := tx.ExecContext(r.Context(), `
			INSERT INTO books (
				id, tenant_id, isbn_13, isbn_10, title, subtitle, authors_json,
				publisher, published_year, language, page_count, description,
				format, genre, notes, progressive_number, created_at, updated_at
			) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, NULL, ?, NULL, ?, NULL, ?, ?)
		`, bookID, id.TenantID, nullable(b.ISBN13), nullable(b.ISBN10),
			b.Title, string(authorsJSON), nullable(b.Publisher),
			nullableInt(b.Year), nullable(b.Language), nullableInt(b.Pages),
			nullable(b.Format), nullable(b.Notes), now, now); err != nil {
			writeErr(w, http.StatusInternalServerError, "insert failed")
			return
		}
		isbnBoth := strings.TrimSpace(b.ISBN13 + " " + b.ISBN10)
		if _, err := tx.ExecContext(r.Context(), `
			INSERT INTO books_fts (rowid, title, subtitle, authors, description, notes, isbn)
			VALUES ((SELECT rowid FROM books WHERE id = ?), ?, '', ?, '', ?, ?)
		`, bookID, b.Title, strings.Join(b.Authors, ", "), b.Notes, isbnBoth); err != nil {
			writeErr(w, http.StatusInternalServerError, "fts mirror failed")
			return
		}
	}
	if err := tx.Commit(); err != nil {
		writeErr(w, http.StatusInternalServerError, "commit failed")
		return
	}
	resp.Imported = len(toInsert)

	_ = h.Audit.Write(r.Context(), mw.Event{
		Action: "book.import", EntityType: "book",
		After: map[string]interface{}{"format": format, "imported": resp.Imported, "duplicates": resp.Duplicates},
	})
	writeJSON(w, http.StatusOK, resp)
}

// Export gestisce GET /api/v1/export?format=json|csv — dump completo dei
// libri del tenant. Le colonne CSV riusano i nomi dei campi JSON.
func (h *BookHandlers) Export(w http.ResponseWriter, r *http.Request) {
	id, ok := mw.FromContext(r.Context())
	if !ok {
		writeErr(w, http.StatusUnauthorized, "no identity")
		return
	}
	rows, err := h.DB.QueryContext(r.Context(), `
		SELECT id, library_id, isbn_13, isbn_10, title, subtitle, authors_json,
		       publisher, published_year, language, page_count, description,
		       format, genre, notes, progressive_number, created_at, updated_at
		  FROM books WHERE tenant_id = ?
		  ORDER BY COALESCE(progressive_number, 999999999), created_at
	`, id.TenantID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}
	defer rows.Close()
	books := []bookDTO{}
	for rows.Next() {
		d, err := scanBook(rows)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "scan error")
			return
		}
		books = append(books, d)
	}

	if strings.EqualFold(r.URL.Query().Get("format"), "csv") {
		w.Header().Set("Content-Type", "text/csv; charset=utf-8")
		w.Header().Set("Content-Disposition", `attachment; filename="bookeeper-export.csv"`)
		cw := csv.NewWriter(w)
		_ = cw.Write([]string{"progressive_number", "title", "subtitle", "authors",
			"isbn_13", "isbn_10", "publisher", "published_year", "language",
			"page_count", "format", "genre", "notes"})
		for _, b := range books {
			_ = cw.Write([]string{
				intPtrStr(b.ProgressiveNumber), b.Title, strPtr(b.Subtitle),
				strings.Join(b.Authors, "; "), strPtr(b.ISBN13), strPtr(b.ISBN10),
				strPtr(b.Publisher), intPtrStr(b.PublishedYear), strPtr(b.Language),
				intPtrStr(b.PageCount), strPtr(b.Format), strPtr(b.Genre), strPtr(b.Notes),
			})
		}
		cw.Flush()
		return
	}

	w.Header().Set("Content-Disposition", `attachment; filename="bookeeper-export.json"`)
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"exported_at": time.Now().UTC().Format(time.RFC3339),
		"books":       books,
	})
}

func strPtr(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}
func intPtrStr(p *int) string {
	if p == nil {
		return ""
	}
	return strconv.Itoa(*p)
}

// --- parser -----------------------------------------------------------------

// detectImportFormat sniffa l'header della prima riga.
func detectImportFormat(content string) string {
	head := content
	if i := strings.IndexAny(head, "\r\n"); i > 0 {
		head = head[:i]
	}
	lower := strings.ToLower(head)
	switch {
	case strings.Contains(lower, "exclusive shelf") || strings.Contains(lower, "bookshelves"):
		return "goodreads"
	case strings.Contains(head, "\t") && (strings.Contains(lower, "primary author") || strings.Contains(lower, "'title'")):
		return "librarything"
	case strings.Contains(lower, "authors") && strings.Contains(lower, "title"):
		return "calibre"
	case strings.Contains(head, "\t"):
		return "librarything"
	}
	return ""
}

func parseImport(format, content string) ([]importedBook, []string, error) {
	switch format {
	case "goodreads":
		return parseDelimited(content, ',', goodreadsMapper)
	case "calibre":
		return parseDelimited(content, ',', calibreMapper)
	case "librarything":
		return parseDelimited(content, '\t', libraryThingMapper)
	default:
		return nil, nil, fmt.Errorf("unknown format %q", format)
	}
}

// rowMapper trasforma una riga (con lookup per header normalizzato) in libro.
type rowMapper func(get func(col string) string) (importedBook, bool)

func parseDelimited(content string, sep rune, mapRow rowMapper) ([]importedBook, []string, error) {
	// BOM strip: Excel e Goodreads lo mettono spesso.
	content = strings.TrimPrefix(content, "\uFEFF")
	rd := csv.NewReader(strings.NewReader(content))
	rd.Comma = sep
	rd.FieldsPerRecord = -1 // righe irregolari: gestite a mano
	rd.LazyQuotes = true

	header, err := rd.Read()
	if err != nil {
		return nil, nil, fmt.Errorf("empty file")
	}
	idx := map[string]int{}
	for i, h := range header {
		idx[normHeader(h)] = i
	}

	var books []importedBook
	var errs []string
	line := 1
	for {
		rec, err := rd.Read()
		line++
		if err != nil {
			if err.Error() == "EOF" || strings.Contains(err.Error(), "EOF") {
				break
			}
			errs = append(errs, fmt.Sprintf("line %d: %v", line, err))
			continue
		}
		get := func(col string) string {
			i, ok := idx[col]
			if !ok || i >= len(rec) {
				return ""
			}
			return strings.TrimSpace(rec[i])
		}
		b, ok := mapRow(get)
		if !ok {
			continue // riga vuota / senza titolo
		}
		books = append(books, b)
	}
	if len(errs) > 50 {
		errs = errs[:50]
	}
	return books, errs, nil
}

// normHeader: lowercase, senza apici LibraryThing, spazi compressi.
func normHeader(h string) string {
	h = strings.TrimSpace(strings.Trim(strings.TrimSpace(h), "'\""))
	return strings.ToLower(strings.Join(strings.Fields(h), " "))
}

func goodreadsMapper(get func(string) string) (importedBook, bool) {
	title := get("title")
	if title == "" {
		return importedBook{}, false
	}
	authors := []string{}
	if a := get("author"); a != "" {
		authors = append(authors, a)
	}
	for _, extra := range strings.Split(get("additional authors"), ",") {
		if e := strings.TrimSpace(extra); e != "" {
			authors = append(authors, e)
		}
	}
	i13 := normISBN(get("isbn13"))
	i10 := normISBN(get("isbn"))
	year := atoiSafe(get("year published"))
	if year == 0 {
		year = atoiSafe(get("original publication year"))
	}
	notes := get("private notes")
	if rev := get("my review"); rev != "" {
		if notes != "" {
			notes += "\n\n"
		}
		notes += rev
	}
	return importedBook{
		Title: title, Authors: authors,
		ISBN13: keep13(i13), ISBN10: keep10(i10),
		Publisher: get("publisher"), Year: year,
		Pages:  atoiSafe(get("number of pages")),
		Format: mapBinding(get("binding")),
		Notes:  notes,
	}, true
}

func calibreMapper(get func(string) string) (importedBook, bool) {
	title := get("title")
	if title == "" {
		return importedBook{}, false
	}
	authors := []string{}
	for _, a := range strings.Split(get("authors"), "&") {
		if a = strings.TrimSpace(a); a != "" {
			authors = append(authors, a)
		}
	}
	isbn := normISBN(get("isbn"))
	year := 0
	if pd := get("pubdate"); len(pd) >= 4 {
		year = atoiSafe(pd[:4])
	}
	lang := get("languages")
	if i := strings.IndexAny(lang, ",;"); i > 0 {
		lang = strings.TrimSpace(lang[:i])
	}
	return importedBook{
		Title: title, Authors: authors,
		ISBN13: keep13(isbn), ISBN10: keep10(isbn),
		Publisher: get("publisher"), Year: year,
		Language: lang,
	}, true
}

func libraryThingMapper(get func(string) string) (importedBook, bool) {
	title := get("title")
	if title == "" {
		return importedBook{}, false
	}
	authors := []string{}
	if a := get("primary author"); a != "" {
		authors = append(authors, a)
	} else if a := get("author (first, last)"); a != "" {
		authors = append(authors, a)
	}
	if a := get("secondary author"); a != "" {
		authors = append(authors, a)
	}
	// LT esporta l'ISBN come "[0316769177]".
	isbn := normISBN(strings.Trim(get("isbn"), "[]"))
	if isbn == "" {
		isbn = normISBN(strings.Trim(get("isbns"), "[]"))
	}
	year := atoiSafe(get("date"))
	pub := get("publication")
	return importedBook{
		Title: title, Authors: authors,
		ISBN13: keep13(isbn), ISBN10: keep10(isbn),
		Publisher: pub, Year: year,
	}, true
}

// normISBN strip del wrapper Goodreads `="0316769177"`, trattini e spazi.
// Ritorna "" se il risultato non è lungo 10 o 13.
func normISBN(s string) string {
	s = strings.TrimSpace(s)
	s = strings.TrimPrefix(s, "=")
	s = strings.Trim(s, "\"")
	s = strings.Map(func(r rune) rune {
		if r == '-' || r == ' ' {
			return -1
		}
		return r
	}, s)
	if len(s) != 10 && len(s) != 13 {
		return ""
	}
	return strings.ToUpper(s) // ISBN-10 può finire in 'x'
}

func keep13(s string) string {
	if len(s) == 13 {
		return s
	}
	return ""
}
func keep10(s string) string {
	if len(s) == 10 {
		return s
	}
	return ""
}

func atoiSafe(s string) int {
	n, _ := strconv.Atoi(strings.TrimSpace(s))
	if n < 0 {
		return 0
	}
	return n
}

// mapBinding traduce il campo Binding di Goodreads nei format Bookeeper.
func mapBinding(b string) string {
	switch strings.ToLower(b) {
	case "hardcover", "hardback", "copertina rigida":
		return "hardcover"
	case "paperback", "mass market paperback", "softcover", "copertina flessibile", "brossura":
		return "paperback"
	case "ebook", "kindle edition", "epub":
		return "ebook"
	case "audiobook", "audible audio", "audio cd":
		return "audiobook"
	default:
		return ""
	}
}
