package api

import (
	"crypto/rand"
	"database/sql"
	"encoding/base32"
	"errors"
	"net/http"
	"strings"

	"github.com/bookeeper/bookeeper-neo/server/internal/ca"
	"github.com/bookeeper/bookeeper-neo/server/internal/mw"
)

// TenantHandlers serve la lettura e gestione del proprio tenant
// dalla superficie autenticata mTLS. Sono pensati per la
// "Settings → Tenant" del client desktop (visualizzazione invite_code,
// rotazione invite_code, fingerprint del CA, info owner).
type TenantHandlers struct {
	DB    *sql.DB
	Audit *mw.Audit
}

type tenantInfoResp struct {
	ID             string `json:"id"`
	Name           string `json:"name"`
	InviteCode     string `json:"invite_code"`
	CreatedAt      int64  `json:"created_at"`
	CAFingerprint  string `json:"ca_fingerprint"`
	IsOwner        bool   `json:"is_owner"`
	OwnerEmail     string `json:"owner_email,omitempty"`
}

// Get restituisce le info del tenant a cui l'utente appartiene.
//
// L'invite_code è considerato sensibile (consente nuovi pairing): viene
// restituito comunque agli utenti del tenant in chiaro perché:
//   - servono già tutte le credenziali (admin_password) per poterlo usare;
//   - la connessione è mTLS-only.
func (h *TenantHandlers) Get(w http.ResponseWriter, r *http.Request) {
	id, ok := mw.FromContext(r.Context())
	if !ok {
		writeErr(w, http.StatusUnauthorized, "no identity")
		return
	}
	var (
		tID, name, invite, caCertPEM string
		createdAt                    int64
	)
	err := h.DB.QueryRowContext(r.Context(), `
        SELECT id, name, invite_code, ca_cert_pem, created_at
          FROM tenants WHERE id = ?
    `, id.TenantID).Scan(&tID, &name, &invite, &caCertPEM, &createdAt)
	if errors.Is(err, sql.ErrNoRows) {
		writeErr(w, http.StatusNotFound, "tenant not found")
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}

	// Owner: il primo utente con role='owner' del tenant.
	var ownerEmail string
	var role string
	_ = h.DB.QueryRowContext(r.Context(),
		`SELECT email, role FROM users WHERE id = ? AND tenant_id = ?`,
		id.UserID, id.TenantID,
	).Scan(&ownerEmail, &role)
	resp := tenantInfoResp{
		ID:            tID,
		Name:          name,
		InviteCode:    invite,
		CreatedAt:     createdAt,
		CAFingerprint: ca.FingerprintPEM([]byte(caCertPEM)),
		IsOwner:       role == "owner",
		OwnerEmail:    ownerEmail,
	}
	writeJSON(w, http.StatusOK, resp)
}

type rotateInviteReq struct {
	AdminPassword string `json:"admin_password"`
}

type rotateInviteResp struct {
	InviteCode string `json:"invite_code"`
}

// RotateInvite genera un nuovo invite_code per il tenant. Richiede
// l'admin_password (la stessa che cifra il CA) per evitare che un utente
// senza privilegi del tenant possa farlo, e che un client compromesso
// (cert valido ma admin_password non noto) possa abilitare pairing nuovi.
func (h *TenantHandlers) RotateInvite(w http.ResponseWriter, r *http.Request) {
	id, ok := mw.FromContext(r.Context())
	if !ok {
		writeErr(w, http.StatusUnauthorized, "no identity")
		return
	}
	var req rotateInviteReq
	if !readJSON(w, r, &req) {
		return
	}
	if len(req.AdminPassword) < 12 {
		writeErr(w, http.StatusBadRequest, "admin password too short")
		return
	}

	// Verifica admin_password tentando di sbloccare il CA.
	var caCertPEM string
	var keyEnc, keySalt, keyNonce []byte
	err := h.DB.QueryRowContext(r.Context(), `
        SELECT ca_cert_pem, ca_key_enc, ca_key_salt, ca_key_nonce
          FROM tenants WHERE id = ?
    `, id.TenantID).Scan(&caCertPEM, &keyEnc, &keySalt, &keyNonce)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}
	if _, err := ca.Unlock([]byte(caCertPEM), keyEnc, keySalt, keyNonce, req.AdminPassword); err != nil {
		writeErr(w, http.StatusUnauthorized, "invalid admin password")
		return
	}

	newCode, err := newInviteCodeTenant()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "rng failed")
		return
	}
	if _, err := h.DB.ExecContext(r.Context(),
		`UPDATE tenants SET invite_code = ? WHERE id = ?`, newCode, id.TenantID,
	); err != nil {
		writeErr(w, http.StatusInternalServerError, "update failed")
		return
	}
	writeJSON(w, http.StatusOK, rotateInviteResp{InviteCode: newCode})
}

// Duplica newInviteCode da setup.go per evitare ciclo di import:
// la funzione originale è privata al package ed è già qui dentro.
func newInviteCodeTenant() (string, error) {
	b := make([]byte, 10)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return strings.ToUpper(base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(b)), nil
}