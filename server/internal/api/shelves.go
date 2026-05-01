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

// ShelfHandlers groups CRUD on shelves plus per-book slot assignment.
// Layout discipline (rows × slotsPerRow) is enforced by SQL CHECK constraints
// in the shelves migration; the handlers re-validate to return tidy 4xx
// errors instead of 500s when clients send out-of-range values.
type ShelfHandlers struct {
	DB    *sql.DB
	Audit *mw.Audit
}

const (
	shelfRowsMin     = 1
	shelfRowsMax     = 12
	shelfSlotsMin    = 5
	shelfSlotsMax    = 60
	shelfCapacityMax = shelfRowsMax * shelfSlotsMax
)

type shelfDTO struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	Rows        int     `json:"rows"`
	SlotsPerRow int     `json:"slots_per_row"`
	Color       string  `json:"color"`
	Icon        *string `json:"icon,omitempty"`
	Capacity    int     `json:"capacity"`
	BookCount   int     `json:"book_count"`
	CreatedAt   int64   `json:"created_at"`
	UpdatedAt   int64   `json:"updated_at"`
}

type shelfBookDTO struct {
	BookID      string  `json:"book_id"`
	ShelfID     string  `json:"shelf_id"`
	RowIndex    int     `json:"row_index"`
	SlotIndex   int     `json:"slot_index"`
	SpineColor  *string `json:"spine_color,omitempty"`
	SpineWidth  int     `json:"spine_width"`
	Title       string  `json:"title"`
	UpdatedAt   int64   `json:"updated_at"`
}

func (h *ShelfHandlers) List(w http.ResponseWriter, r *http.Request) {
	id, ok := mw.FromContext(r.Context())
	if !ok {
		writeErr(w, http.StatusUnauthorized, "no identity")
		return
	}
	rows, err := h.DB.QueryContext(r.Context(), `
		SELECT s.id, s.name, s.rows, s.slots_per_row, s.color, s.icon,
		       s.created_at, s.updated_at,
		       (SELECT COUNT(*) FROM shelf_books sb WHERE sb.shelf_id = s.id) AS book_count
		  FROM shelves s
		 WHERE s.tenant_id = ?
		 ORDER BY s.created_at ASC
	`, id.TenantID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}
	defer rows.Close()
	out := []shelfDTO{}
	for rows.Next() {
		d, err := scanShelf(rows)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "scan error")
			return
		}
		out = append(out, d)
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"shelves": out})
}

func (h *ShelfHandlers) Get(w http.ResponseWriter, r *http.Request) {
	id, ok := mw.FromContext(r.Context())
	if !ok {
		writeErr(w, http.StatusUnauthorized, "no identity")
		return
	}
	shelfID := chi.URLParam(r, "id")
	row := h.DB.QueryRowContext(r.Context(), `
		SELECT s.id, s.name, s.rows, s.slots_per_row, s.color, s.icon,
		       s.created_at, s.updated_at,
		       (SELECT COUNT(*) FROM shelf_books sb WHERE sb.shelf_id = s.id) AS book_count
		  FROM shelves s
		 WHERE s.id = ? AND s.tenant_id = ?
	`, shelfID, id.TenantID)
	d, err := scanShelf(row)
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

type shelfReq struct {
	Name        string `json:"name"`
	Rows        int    `json:"rows"`
	SlotsPerRow int    `json:"slots_per_row"`
	Color       string `json:"color"`
	Icon        string `json:"icon"`
}

func (h *ShelfHandlers) Create(w http.ResponseWriter, r *http.Request) {
	id, ok := mw.FromContext(r.Context())
	if !ok {
		writeErr(w, http.StatusUnauthorized, "no identity")
		return
	}
	var req shelfReq
	if !readJSON(w, r, &req) {
		return
	}
	if msg := validateShelfReq(&req); msg != "" {
		writeErr(w, http.StatusBadRequest, msg)
		return
	}
	shelfID := uuid.NewString()
	now := time.Now().Unix()
	if _, err := h.DB.ExecContext(r.Context(), `
		INSERT INTO shelves (id, tenant_id, name, rows, slots_per_row, color, icon, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, shelfID, id.TenantID, req.Name, req.Rows, req.SlotsPerRow,
		req.Color, nullable(req.Icon), now, now); err != nil {
		writeErr(w, http.StatusInternalServerError, "insert failed")
		return
	}
	_ = h.Audit.Write(r.Context(), mw.Event{
		Action: "shelf.create", EntityType: "shelf", EntityID: shelfID, After: req,
	})
	writeJSON(w, http.StatusOK, map[string]string{"id": shelfID})
}

func (h *ShelfHandlers) Update(w http.ResponseWriter, r *http.Request) {
	id, ok := mw.FromContext(r.Context())
	if !ok {
		writeErr(w, http.StatusUnauthorized, "no identity")
		return
	}
	shelfID := chi.URLParam(r, "id")
	var req shelfReq
	if !readJSON(w, r, &req) {
		return
	}
	if msg := validateShelfReq(&req); msg != "" {
		writeErr(w, http.StatusBadRequest, msg)
		return
	}
	// Refuse to shrink a shelf below the maximum (row,slot) currently in use.
	row := h.DB.QueryRowContext(r.Context(), `
		SELECT COALESCE(MAX(row_index), -1), COALESCE(MAX(slot_index), -1)
		  FROM shelf_books WHERE shelf_id = ?
	`, shelfID)
	var maxRow, maxSlot int
	_ = row.Scan(&maxRow, &maxSlot)
	if maxRow >= req.Rows {
		writeErr(w, http.StatusConflict, "row count below current usage")
		return
	}
	if maxSlot >= req.SlotsPerRow {
		writeErr(w, http.StatusConflict, "slots per row below current usage")
		return
	}
	now := time.Now().Unix()
	res, err := h.DB.ExecContext(r.Context(), `
		UPDATE shelves SET name = ?, rows = ?, slots_per_row = ?, color = ?, icon = ?, updated_at = ?
		 WHERE id = ? AND tenant_id = ?
	`, req.Name, req.Rows, req.SlotsPerRow, req.Color, nullable(req.Icon), now, shelfID, id.TenantID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "update failed")
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	_ = h.Audit.Write(r.Context(), mw.Event{
		Action: "shelf.update", EntityType: "shelf", EntityID: shelfID, After: req,
	})
	writeJSON(w, http.StatusOK, map[string]string{"id": shelfID})
}

func (h *ShelfHandlers) Delete(w http.ResponseWriter, r *http.Request) {
	id, ok := mw.FromContext(r.Context())
	if !ok {
		writeErr(w, http.StatusUnauthorized, "no identity")
		return
	}
	shelfID := chi.URLParam(r, "id")
	res, err := h.DB.ExecContext(r.Context(),
		`DELETE FROM shelves WHERE id = ? AND tenant_id = ?`, shelfID, id.TenantID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "delete failed")
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	_ = h.Audit.Write(r.Context(), mw.Event{
		Action: "shelf.delete", EntityType: "shelf", EntityID: shelfID,
	})
	w.WriteHeader(http.StatusNoContent)
}

// ListBooks returns every book placed on a shelf, joined with the book
// title for fast SVG rendering without a second round-trip.
func (h *ShelfHandlers) ListBooks(w http.ResponseWriter, r *http.Request) {
	id, ok := mw.FromContext(r.Context())
	if !ok {
		writeErr(w, http.StatusUnauthorized, "no identity")
		return
	}
	shelfID := chi.URLParam(r, "id")
	// Validate ownership first to avoid leaking placement data.
	var owned int
	if err := h.DB.QueryRowContext(r.Context(),
		`SELECT 1 FROM shelves WHERE id = ? AND tenant_id = ?`,
		shelfID, id.TenantID).Scan(&owned); err == sql.ErrNoRows {
		writeErr(w, http.StatusNotFound, "not found")
		return
	} else if err != nil {
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}
	rows, err := h.DB.QueryContext(r.Context(), `
		SELECT sb.book_id, sb.shelf_id, sb.row_index, sb.slot_index,
		       sb.spine_color, sb.spine_width, sb.updated_at, b.title
		  FROM shelf_books sb
		  JOIN books b ON b.id = sb.book_id
		 WHERE sb.shelf_id = ?
		 ORDER BY sb.row_index, sb.slot_index
	`, shelfID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}
	defer rows.Close()
	out := []shelfBookDTO{}
	for rows.Next() {
		var d shelfBookDTO
		var spineColor sql.NullString
		if err := rows.Scan(&d.BookID, &d.ShelfID, &d.RowIndex, &d.SlotIndex,
			&spineColor, &d.SpineWidth, &d.UpdatedAt, &d.Title); err != nil {
			writeErr(w, http.StatusInternalServerError, "scan error")
			return
		}
		d.SpineColor = nullToPtr(spineColor)
		out = append(out, d)
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"books": out})
}

type assignReq struct {
	ShelfID    string  `json:"shelf_id"`
	RowIndex   int     `json:"row_index"`
	SlotIndex  int     `json:"slot_index"`
	SpineColor *string `json:"spine_color,omitempty"`
	SpineWidth int     `json:"spine_width"`
}

// Assign places a book at a specific (row,slot) on a shelf, or removes the
// placement when ShelfID is empty. Constraints: target slot must be free
// (UNIQUE on the table will reject double-booking) and (row,slot) must fit
// the shelf's configured dimensions.
func (h *ShelfHandlers) Assign(w http.ResponseWriter, r *http.Request) {
	id, ok := mw.FromContext(r.Context())
	if !ok {
		writeErr(w, http.StatusUnauthorized, "no identity")
		return
	}
	bookID := chi.URLParam(r, "id")
	var req assignReq
	if !readJSON(w, r, &req) {
		return
	}
	// Validate book ownership.
	var owned int
	if err := h.DB.QueryRowContext(r.Context(),
		`SELECT 1 FROM books WHERE id = ? AND tenant_id = ?`,
		bookID, id.TenantID).Scan(&owned); err == sql.ErrNoRows {
		writeErr(w, http.StatusNotFound, "book not found")
		return
	} else if err != nil {
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}

	// Empty shelf_id removes any existing placement.
	if strings.TrimSpace(req.ShelfID) == "" {
		if _, err := h.DB.ExecContext(r.Context(),
			`DELETE FROM shelf_books WHERE book_id = ?`, bookID); err != nil {
			writeErr(w, http.StatusInternalServerError, "unassign failed")
			return
		}
		_ = h.Audit.Write(r.Context(), mw.Event{
			Action: "book.shelf.clear", EntityType: "book", EntityID: bookID,
		})
		writeJSON(w, http.StatusOK, map[string]string{"id": bookID})
		return
	}

	// Validate target shelf belongs to tenant and the slot fits.
	var rowsCnt, slotsCnt int
	if err := h.DB.QueryRowContext(r.Context(),
		`SELECT rows, slots_per_row FROM shelves WHERE id = ? AND tenant_id = ?`,
		req.ShelfID, id.TenantID).Scan(&rowsCnt, &slotsCnt); err == sql.ErrNoRows {
		writeErr(w, http.StatusNotFound, "shelf not found")
		return
	} else if err != nil {
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}
	if req.RowIndex < 0 || req.RowIndex >= rowsCnt {
		writeErr(w, http.StatusBadRequest, "row_index out of range")
		return
	}
	if req.SlotIndex < 0 || req.SlotIndex >= slotsCnt {
		writeErr(w, http.StatusBadRequest, "slot_index out of range")
		return
	}
	if req.SpineWidth < 1 || req.SpineWidth > 3 {
		req.SpineWidth = 1
	}
	now := time.Now().Unix()
	// Upsert: a book occupies at most one slot at any time.
	if _, err := h.DB.ExecContext(r.Context(), `
		INSERT INTO shelf_books (book_id, shelf_id, row_index, slot_index, spine_color, spine_width, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(book_id) DO UPDATE SET
			shelf_id    = excluded.shelf_id,
			row_index   = excluded.row_index,
			slot_index  = excluded.slot_index,
			spine_color = excluded.spine_color,
			spine_width = excluded.spine_width,
			updated_at  = excluded.updated_at
	`, bookID, req.ShelfID, req.RowIndex, req.SlotIndex,
		nullableStrPtr(req.SpineColor), req.SpineWidth, now); err != nil {
		// Likely the UNIQUE(shelf_id,row,slot) constraint when slot is taken.
		writeErr(w, http.StatusConflict, "slot already occupied")
		return
	}
	_ = h.Audit.Write(r.Context(), mw.Event{
		Action: "book.shelf.assign", EntityType: "book", EntityID: bookID, After: req,
	})
	writeJSON(w, http.StatusOK, map[string]string{"id": bookID})
}

// --- helpers ---

func scanShelf(s rowScanner) (shelfDTO, error) {
	var d shelfDTO
	var icon sql.NullString
	if err := s.Scan(&d.ID, &d.Name, &d.Rows, &d.SlotsPerRow, &d.Color, &icon,
		&d.CreatedAt, &d.UpdatedAt, &d.BookCount); err != nil {
		return d, err
	}
	d.Icon = nullToPtr(icon)
	d.Capacity = d.Rows * d.SlotsPerRow
	return d, nil
}

func validateShelfReq(req *shelfReq) string {
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		return "name required"
	}
	if req.Rows < shelfRowsMin || req.Rows > shelfRowsMax {
		return "rows out of range"
	}
	if req.SlotsPerRow < shelfSlotsMin || req.SlotsPerRow > shelfSlotsMax {
		return "slots_per_row out of range"
	}
	if req.Rows*req.SlotsPerRow > shelfCapacityMax {
		return "capacity too large"
	}
	if strings.TrimSpace(req.Color) == "" {
		req.Color = "sage"
	}
	return ""
}

func nullableStrPtr(p *string) interface{} {
	if p == nil {
		return nil
	}
	return nullable(*p)
}
