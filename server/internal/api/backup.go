package api

import (
	"database/sql"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/bookeeper/bookeeper-neo/server/internal/ca"
	"github.com/bookeeper/bookeeper-neo/server/internal/mw"
)

// Backup & Restore (roadmap 1.2).
//
// Il DB server è multi-tenant: niente VACUUM INTO dell'intero file. Il backup
// è un dump JSON tenant-scoped, tabella per tabella, con dump/restore GENERICI
// (SELECT * / INSERT dalle chiavi): un futuro ALTER TABLE non rompe il formato.
//
// Il restore è distruttivo (sostituisce tutti i dati della libreria) e
// richiede l'admin_password del tenant, verificata provando a sbloccare il CA
// — stesso pattern di RotateInvite. Vale sia per la modalità locale (il client
// desktop la recupera da solo) che remota (l'utente la digita).

const backupVersion = 1

// backupTables: ordine di INSERT rispettoso delle FK. La delete usa l'ordine
// inverso. where: filtro tenant (diretto o via join per le tabelle senza
// tenant_id).
var backupTables = []struct {
	name  string
	where string
}{
	{"libraries", "tenant_id = ?"},
	{"books", "tenant_id = ?"},
	{"shelves", "tenant_id = ?"},
	{"tags", "tenant_id = ?"},
	{"shelf_books", "book_id IN (SELECT id FROM books WHERE tenant_id = ?)"},
	{"loans", "tenant_id = ?"},
	{"wishlist", "tenant_id = ?"},
	{"reading_log", "tenant_id = ?"},
	{"book_tags", "book_id IN (SELECT id FROM books WHERE tenant_id = ?)"},
}

type backupFile struct {
	App        string                       `json:"app"`
	Version    int                          `json:"version"`
	ExportedAt string                       `json:"exported_at"`
	TenantID   string                       `json:"tenant_id"`
	TenantName string                       `json:"tenant_name"`
	Tables     map[string][]map[string]any  `json:"tables"`
}

// Backup gestisce POST /api/v1/backup: dump completo della libreria.
func (h *TenantHandlers) Backup(w http.ResponseWriter, r *http.Request) {
	id, ok := mw.FromContext(r.Context())
	if !ok {
		writeErr(w, http.StatusUnauthorized, "no identity")
		return
	}
	var tenantName string
	_ = h.DB.QueryRowContext(r.Context(),
		`SELECT name FROM tenants WHERE id = ?`, id.TenantID).Scan(&tenantName)

	out := backupFile{
		App: "bookeeper", Version: backupVersion,
		ExportedAt: time.Now().UTC().Format(time.RFC3339),
		TenantID:   id.TenantID, TenantName: tenantName,
		Tables: map[string][]map[string]any{},
	}
	for _, t := range backupTables {
		rows, err := h.DB.QueryContext(r.Context(),
			`SELECT * FROM `+t.name+` WHERE `+t.where, id.TenantID)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "dump failed: "+t.name)
			return
		}
		recs, err := rowsToMaps(rows)
		rows.Close()
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "dump failed: "+t.name)
			return
		}
		out.Tables[t.name] = recs
	}

	w.Header().Set("Content-Disposition", `attachment; filename="bookeeper-backup.json"`)
	writeJSON(w, http.StatusOK, out)
}

type restoreReq struct {
	AdminPassword string     `json:"admin_password"`
	Data          backupFile `json:"data"`
}

// Restore gestisce POST /api/v1/restore: sostituisce TUTTI i dati della
// libreria con quelli del backup. Transazionale: o tutto o niente.
func (h *TenantHandlers) Restore(w http.ResponseWriter, r *http.Request) {
	id, ok := mw.FromContext(r.Context())
	if !ok {
		writeErr(w, http.StatusUnauthorized, "no identity")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 64<<20)
	var req restoreReq
	if !readJSON(w, r, &req) {
		return
	}
	if req.Data.App != "bookeeper" || req.Data.Version < 1 {
		writeErr(w, http.StatusBadRequest, "not a bookeeper backup")
		return
	}
	if req.Data.Version > backupVersion {
		writeErr(w, http.StatusBadRequest, "backup from a newer version")
		return
	}

	// Gate distruttivo: admin_password verificata via CA unlock.
	var caCertPEM string
	var keyEnc, keySalt, keyNonce []byte
	if err := h.DB.QueryRowContext(r.Context(), `
        SELECT ca_cert_pem, ca_key_enc, ca_key_salt, ca_key_nonce
          FROM tenants WHERE id = ?
    `, id.TenantID).Scan(&caCertPEM, &keyEnc, &keySalt, &keyNonce); err != nil {
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}
	if _, err := ca.Unlock([]byte(caCertPEM), keyEnc, keySalt, keyNonce, req.AdminPassword); err != nil {
		writeErr(w, http.StatusUnauthorized, "invalid admin password")
		return
	}

	// Utenti validi nel tenant di destinazione: i riferimenti user del
	// backup che non esistono qui vengono rimappati (vedi fixUserRefs).
	users := map[string]bool{}
	urows, err := h.DB.QueryContext(r.Context(),
		`SELECT id FROM users WHERE tenant_id = ?`, id.TenantID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}
	for urows.Next() {
		var uid string
		_ = urows.Scan(&uid)
		users[uid] = true
	}
	urows.Close()

	tx, err := h.DB.BeginTx(r.Context(), nil)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}
	defer func() { _ = tx.Rollback() }()

	// Wipe: FTS prima (contentless, va svuotata via rowid join), poi le
	// tabelle in ordine inverso rispetto all'insert.
	if _, err := tx.ExecContext(r.Context(), `
		DELETE FROM books_fts WHERE rowid IN (SELECT rowid FROM books WHERE tenant_id = ?)
	`, id.TenantID); err != nil {
		writeErr(w, http.StatusInternalServerError, "fts wipe failed")
		return
	}
	for i := len(backupTables) - 1; i >= 0; i-- {
		t := backupTables[i]
		if _, err := tx.ExecContext(r.Context(),
			`DELETE FROM `+t.name+` WHERE `+t.where, id.TenantID); err != nil {
			writeErr(w, http.StatusInternalServerError, "wipe failed: "+t.name)
			return
		}
	}

	// Insert generico dalle chiavi di ogni record. tenant_id forzato al
	// tenant corrente: un backup di un'altra libreria si ripristina qui
	// senza portarsi dietro l'id di origine.
	total := 0
	for _, t := range backupTables {
		for _, rec := range req.Data.Tables[t.name] {
			if _, hasTenant := rec["tenant_id"]; hasTenant {
				rec["tenant_id"] = id.TenantID
			}
			fixUserRefs(t.name, rec, users, id.UserID)
			if err := insertRecord(tx, t.name, rec); err != nil {
				writeErr(w, http.StatusBadRequest,
					fmt.Sprintf("restore failed on %s: %v", t.name, err))
				return
			}
			total++
		}
	}

	// Ricostruisci il mirror FTS dai libri appena inseriti.
	if _, err := tx.ExecContext(r.Context(), `
		INSERT INTO books_fts (rowid, title, subtitle, authors, description, notes, isbn)
		SELECT rowid, title, COALESCE(subtitle,''),
		       COALESCE((SELECT group_concat(value, ', ') FROM json_each(authors_json)), ''),
		       COALESCE(description,''), COALESCE(notes,''),
		       TRIM(COALESCE(isbn_13,'') || ' ' || COALESCE(isbn_10,''))
		  FROM books WHERE tenant_id = ?
	`, id.TenantID); err != nil {
		writeErr(w, http.StatusInternalServerError, "fts rebuild failed")
		return
	}

	if err := tx.Commit(); err != nil {
		writeErr(w, http.StatusInternalServerError, "commit failed")
		return
	}
	_ = h.Audit.Write(r.Context(), mw.Event{
		Action: "tenant.restore", EntityType: "tenant", EntityID: id.TenantID,
		After: map[string]any{"rows": total, "backup_of": req.Data.TenantID},
	})
	writeJSON(w, http.StatusOK, map[string]int{"restored_rows": total})
}

// fixUserRefs rimappa i riferimenti utente del backup su utenti esistenti nel
// tenant di destinazione: user_id NOT NULL → utente corrente; FK nullable →
// NULL. Evita FK failure ripristinando su un tenant con utenti diversi.
func fixUserRefs(table string, rec map[string]any, users map[string]bool, currentUser string) {
	switch table {
	case "wishlist", "reading_log":
		if uid, _ := rec["user_id"].(string); !users[uid] {
			rec["user_id"] = currentUser
		}
	case "loans":
		if uid, ok := rec["borrower_user_id"].(string); ok && !users[uid] {
			rec["borrower_user_id"] = nil
		}
	}
}

// rowsToMaps materializza un result set generico in slice di mappe.
func rowsToMaps(rows *sql.Rows) ([]map[string]any, error) {
	cols, err := rows.Columns()
	if err != nil {
		return nil, err
	}
	out := []map[string]any{}
	for rows.Next() {
		vals := make([]any, len(cols))
		ptrs := make([]any, len(cols))
		for i := range vals {
			ptrs[i] = &vals[i]
		}
		if err := rows.Scan(ptrs...); err != nil {
			return nil, err
		}
		rec := map[string]any{}
		for i, c := range cols {
			v := vals[i]
			// []byte → string: i BLOB non esistono nelle tabelle dati e
			// json.Marshal renderebbe base64 illeggibile.
			if b, ok := v.([]byte); ok {
				v = string(b)
			}
			rec[c] = v
		}
		out = append(out, rec)
	}
	return out, rows.Err()
}

// insertRecord costruisce un INSERT dalle chiavi del record. Chiavi ordinate
// per avere SQL deterministico (utile nei test).
func insertRecord(tx *sql.Tx, table string, rec map[string]any) error {
	if len(rec) == 0 {
		return nil
	}
	cols := make([]string, 0, len(rec))
	for c := range rec {
		if !validIdent(c) {
			return fmt.Errorf("invalid column %q", c)
		}
		cols = append(cols, c)
	}
	sort.Strings(cols)
	args := make([]any, len(cols))
	for i, c := range cols {
		v := rec[c]
		// I numeri JSON arrivano come float64: SQLite li accetta, ma gli
		// interi (timestamp, contatori) vanno riconvertiti per non
		// sporcare le colonne INTEGER con affinità REAL.
		if f, ok := v.(float64); ok && f == float64(int64(f)) {
			v = int64(f)
		}
		args[i] = v
	}
	q := "INSERT INTO " + table + " (" + strings.Join(cols, ", ") + ") VALUES (" +
		strings.TrimSuffix(strings.Repeat("?,", len(cols)), ",") + ")"
	_, err := tx.Exec(q, args...)
	return err
}

// validIdent: solo [a-z0-9_] — le chiavi del backup finiscono nell'SQL.
func validIdent(s string) bool {
	if s == "" {
		return false
	}
	for _, r := range s {
		if (r < 'a' || r > 'z') && (r < '0' || r > '9') && r != '_' {
			return false
		}
	}
	return true
}
