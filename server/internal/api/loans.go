package api

import (
	"database/sql"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/bookeeper/bookeeper-neo/server/internal/mw"
)

// LoanHandlers espone CRUD sui prestiti familiari (scope: tenant_id).
//
// Schema: vedi 20260501000001_initial.sql tabella `loans`.
//
// Stato di un prestito (derivato lato client da lent_at/due_at/returned_at):
//   - active   : returned_at IS NULL && (due_at IS NULL || due_at >= now)
//   - overdue  : returned_at IS NULL && due_at IS NOT NULL && due_at < now
//   - returned : returned_at IS NOT NULL
//
// La List restituisce anche book_title / book_authors_json (JOIN books)
// così la UI non deve fare N richieste extra per mostrare il libro.
type LoanHandlers struct {
	DB    *sql.DB
	Audit *mw.Audit
}

type loanDTO struct {
	ID             string  `json:"id"`
	BookID         string  `json:"book_id"`
	BookTitle      string  `json:"book_title"`
	BookAuthors    string  `json:"book_authors"` // JSON array string da books.authors_json
	BorrowerName   string  `json:"borrower_name"`
	BorrowerUserID *string `json:"borrower_user_id,omitempty"`
	LentAt         int64   `json:"lent_at"`
	DueAt          *int64  `json:"due_at,omitempty"`
	ReturnedAt     *int64  `json:"returned_at,omitempty"`
	Notes          *string `json:"notes,omitempty"`
}

type loanReq struct {
	BookID       string `json:"book_id"`
	BorrowerName string `json:"borrower_name"`
	LentAt       int64  `json:"lent_at"`
	DueAt        int64  `json:"due_at"`
	Notes        string `json:"notes"`
}

type loanReturnReq struct {
	ReturnedAt int64 `json:"returned_at"`
}

func (h *LoanHandlers) List(w http.ResponseWriter, r *http.Request) {
	id, ok := mw.FromContext(r.Context())
	if !ok {
		writeErr(w, http.StatusUnauthorized, "no identity")
		return
	}
	// Ordine: prima i prestiti aperti (returned_at IS NULL) ordinati per
	// scadenza ascendente (più imminenti in cima); poi i restituiti recenti.
	rows, err := h.DB.QueryContext(r.Context(), `
		SELECT l.id, l.book_id, COALESCE(b.title, ''), COALESCE(b.authors_json, '[]'),
		       l.borrower_name, l.borrower_user_id,
		       l.lent_at, l.due_at, l.returned_at, l.notes
		  FROM loans l
		  LEFT JOIN books b ON b.id = l.book_id
		 WHERE l.tenant_id = ?
		 ORDER BY (l.returned_at IS NOT NULL) ASC,
		          COALESCE(l.due_at, 99999999999) ASC,
		          l.lent_at DESC
	`, id.TenantID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}
	defer rows.Close()
	out := []loanDTO{}
	for rows.Next() {
		d, err := scanLoan(rows)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "scan error")
			return
		}
		out = append(out, d)
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"items": out})
}

func (h *LoanHandlers) Create(w http.ResponseWriter, r *http.Request) {
	id, ok := mw.FromContext(r.Context())
	if !ok {
		writeErr(w, http.StatusUnauthorized, "no identity")
		return
	}
	var req loanReq
	if !readJSON(w, r, &req) {
		return
	}
	if msg := validateLoanReq(&req); msg != "" {
		writeErr(w, http.StatusBadRequest, msg)
		return
	}
	// Verifica che il libro appartenga al tenant.
	var exists int
	if err := h.DB.QueryRowContext(r.Context(),
		`SELECT 1 FROM books WHERE id = ? AND tenant_id = ?`,
		req.BookID, id.TenantID).Scan(&exists); err == sql.ErrNoRows {
		writeErr(w, http.StatusNotFound, "book not found")
		return
	} else if err != nil {
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}
	loanID := uuid.NewString()
	if _, err := h.DB.ExecContext(r.Context(), `
		INSERT INTO loans (id, tenant_id, book_id, borrower_name, borrower_user_id,
		                   lent_at, due_at, returned_at, notes)
		VALUES (?, ?, ?, ?, NULL, ?, ?, NULL, ?)
	`, loanID, id.TenantID, req.BookID, req.BorrowerName,
		req.LentAt, nullableUnix(req.DueAt), nullable(req.Notes)); err != nil {
		writeErr(w, http.StatusInternalServerError, "insert failed")
		return
	}
	_ = h.Audit.Write(r.Context(), mw.Event{
		Action: "loan.create", EntityType: "loan", EntityID: loanID, After: req,
	})
	writeJSON(w, http.StatusOK, map[string]string{"id": loanID})
}

func (h *LoanHandlers) Update(w http.ResponseWriter, r *http.Request) {
	id, ok := mw.FromContext(r.Context())
	if !ok {
		writeErr(w, http.StatusUnauthorized, "no identity")
		return
	}
	loanID := chi.URLParam(r, "id")
	var req loanReq
	if !readJSON(w, r, &req) {
		return
	}
	if msg := validateLoanReq(&req); msg != "" {
		writeErr(w, http.StatusBadRequest, msg)
		return
	}
	res, err := h.DB.ExecContext(r.Context(), `
		UPDATE loans
		   SET book_id = ?, borrower_name = ?, lent_at = ?, due_at = ?, notes = ?
		 WHERE id = ? AND tenant_id = ?
	`, req.BookID, req.BorrowerName, req.LentAt,
		nullableUnix(req.DueAt), nullable(req.Notes),
		loanID, id.TenantID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "update failed")
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	_ = h.Audit.Write(r.Context(), mw.Event{
		Action: "loan.update", EntityType: "loan", EntityID: loanID, After: req,
	})
	writeJSON(w, http.StatusOK, map[string]string{"id": loanID})
}

func (h *LoanHandlers) Delete(w http.ResponseWriter, r *http.Request) {
	id, ok := mw.FromContext(r.Context())
	if !ok {
		writeErr(w, http.StatusUnauthorized, "no identity")
		return
	}
	loanID := chi.URLParam(r, "id")
	res, err := h.DB.ExecContext(r.Context(),
		`DELETE FROM loans WHERE id = ? AND tenant_id = ?`, loanID, id.TenantID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "delete failed")
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	_ = h.Audit.Write(r.Context(), mw.Event{
		Action: "loan.delete", EntityType: "loan", EntityID: loanID,
	})
	w.WriteHeader(http.StatusNoContent)
}

// Return marca il prestito come restituito. Se il body contiene returned_at
// usa quel timestamp, altrimenti now(). Idempotente: se è già restituito
// aggiorna comunque la data (utile per correggere).
func (h *LoanHandlers) Return(w http.ResponseWriter, r *http.Request) {
	id, ok := mw.FromContext(r.Context())
	if !ok {
		writeErr(w, http.StatusUnauthorized, "no identity")
		return
	}
	loanID := chi.URLParam(r, "id")
	req := loanReturnReq{ReturnedAt: time.Now().Unix()}
	// Body opzionale: se non c'è (Content-Length 0) usiamo il default.
	if r.ContentLength > 0 {
		if !readJSON(w, r, &req) {
			return
		}
	}
	if req.ReturnedAt <= 0 {
		req.ReturnedAt = time.Now().Unix()
	}
	res, err := h.DB.ExecContext(r.Context(), `
		UPDATE loans SET returned_at = ?
		 WHERE id = ? AND tenant_id = ?
	`, req.ReturnedAt, loanID, id.TenantID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "return failed")
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	_ = h.Audit.Write(r.Context(), mw.Event{
		Action: "loan.return", EntityType: "loan", EntityID: loanID,
		After: map[string]int64{"returned_at": req.ReturnedAt},
	})
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"id": loanID, "returned_at": req.ReturnedAt,
	})
}

// Reopen rimuove la data di restituzione (annulla un "restituito" cliccato
// per errore). Riporta lo stato a active/overdue secondo due_at.
func (h *LoanHandlers) Reopen(w http.ResponseWriter, r *http.Request) {
	id, ok := mw.FromContext(r.Context())
	if !ok {
		writeErr(w, http.StatusUnauthorized, "no identity")
		return
	}
	loanID := chi.URLParam(r, "id")
	res, err := h.DB.ExecContext(r.Context(), `
		UPDATE loans SET returned_at = NULL
		 WHERE id = ? AND tenant_id = ?
	`, loanID, id.TenantID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "reopen failed")
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	_ = h.Audit.Write(r.Context(), mw.Event{
		Action: "loan.reopen", EntityType: "loan", EntityID: loanID,
	})
	writeJSON(w, http.StatusOK, map[string]string{"id": loanID})
}

// --- helpers ---

func scanLoan(s rowScanner) (loanDTO, error) {
	var d loanDTO
	var borrowerUserID, notes sql.NullString
	var dueAt, returnedAt sql.NullInt64
	if err := s.Scan(&d.ID, &d.BookID, &d.BookTitle, &d.BookAuthors,
		&d.BorrowerName, &borrowerUserID,
		&d.LentAt, &dueAt, &returnedAt, &notes); err != nil {
		return d, err
	}
	d.BorrowerUserID = nullToPtr(borrowerUserID)
	d.Notes = nullToPtr(notes)
	if dueAt.Valid {
		v := dueAt.Int64
		d.DueAt = &v
	}
	if returnedAt.Valid {
		v := returnedAt.Int64
		d.ReturnedAt = &v
	}
	return d, nil
}

func validateLoanReq(req *loanReq) string {
	req.BookID = strings.TrimSpace(req.BookID)
	req.BorrowerName = strings.TrimSpace(req.BorrowerName)
	req.Notes = strings.TrimSpace(req.Notes)
	if req.BookID == "" {
		return "book_id required"
	}
	if req.BorrowerName == "" {
		return "borrower_name required"
	}
	if req.LentAt <= 0 {
		req.LentAt = time.Now().Unix()
	}
	if req.DueAt > 0 && req.DueAt < req.LentAt {
		return "due_at must be >= lent_at"
	}
	return ""
}

// nullableUnix ritorna nil se v <= 0, così le colonne INTEGER nullable
// restano NULL anziché 0 (semantica: "nessuna scadenza").
func nullableUnix(v int64) interface{} {
	if v <= 0 {
		return nil
	}
	return v
}
