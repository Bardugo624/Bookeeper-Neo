package api

import (
	"crypto/rand"
	"database/sql"
	"encoding/base32"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/bookeeper/bookeeper-neo/server/internal/auth"
	"github.com/bookeeper/bookeeper-neo/server/internal/ca"
	"github.com/bookeeper/bookeeper-neo/server/internal/mw"
	"github.com/bookeeper/bookeeper-neo/server/internal/trustpool"
)

// SetupHandlers serves the very-first-run tenant creation flow on the
// non-mTLS bootstrap port. After at least one tenant exists this endpoint
// continues to allow creating additional tenants on the same server (the
// "multi-household NAS" scenario).
type SetupHandlers struct {
	DB        *sql.DB
	Audit     *mw.Audit
	TrustPool *trustpool.Manager
}

type createTenantReq struct {
	TenantName    string `json:"tenant_name"`
	AdminPassword string `json:"admin_password"` // unlocks the CA private key
	OwnerEmail    string `json:"owner_email"`
	OwnerName     string `json:"owner_name"`
	OwnerPassword string `json:"owner_password"`
}

type createTenantResp struct {
	TenantID   string `json:"tenant_id"`
	UserID     string `json:"user_id"`
	InviteCode string `json:"invite_code"`
}

// CreateTenant bootstraps a new tenant: generates an internal CA, encrypts
// the CA private key with admin_password, and creates the owner user.
func (h *SetupHandlers) CreateTenant(w http.ResponseWriter, r *http.Request) {
	var req createTenantReq
	if !readJSON(w, r, &req) {
		return
	}
	if req.TenantName == "" || req.AdminPassword == "" ||
		req.OwnerEmail == "" || req.OwnerName == "" || req.OwnerPassword == "" {
		writeErr(w, http.StatusBadRequest, "missing fields")
		return
	}
	if len(req.AdminPassword) < 12 || len(req.OwnerPassword) < 8 {
		writeErr(w, http.StatusBadRequest, "passwords too short (admin>=12, owner>=8)")
		return
	}

	// Generate CA material first (CPU-heavy Argon2id).
	mat, err := ca.Bootstrap(req.TenantName, req.AdminPassword)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "ca bootstrap failed")
		return
	}

	pwHash, err := auth.HashPassword(req.OwnerPassword)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "hash failed")
		return
	}

	tenantID := uuid.NewString()
	userID := uuid.NewString()
	inviteCode, err := newInviteCode()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "rng failed")
		return
	}
	now := time.Now().Unix()

	tx, err := h.DB.BeginTx(r.Context(), nil)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}
	defer func() { _ = tx.Rollback() }()

	if _, err := tx.ExecContext(r.Context(), `
        INSERT INTO tenants (id, name, invite_code, ca_cert_pem, ca_key_enc, ca_key_salt, ca_key_nonce, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, tenantID, req.TenantName, inviteCode, string(mat.CertPEM), mat.KeyEnc, mat.KeySalt, mat.KeyNonce, now); err != nil {
		writeErr(w, http.StatusInternalServerError, "tenant insert failed")
		return
	}
	if _, err := tx.ExecContext(r.Context(), `
        INSERT INTO users (id, tenant_id, email, password_hash, display_name, role, created_at)
        VALUES (?, ?, ?, ?, ?, 'owner', ?)
    `, userID, tenantID, strings.ToLower(req.OwnerEmail), pwHash, req.OwnerName, now); err != nil {
		// Surface UNIQUE-violation as a clean 409.
		var sqliteErr interface{ Error() string }
		if errors.As(err, &sqliteErr) && strings.Contains(err.Error(), "UNIQUE") {
			writeErr(w, http.StatusConflict, "email already used")
			return
		}
		writeErr(w, http.StatusInternalServerError, "user insert failed")
		return
	}
	if err := tx.Commit(); err != nil {
		writeErr(w, http.StatusInternalServerError, "commit failed")
		return
	}

	_ = h.Audit.WriteAnon(r.Context(), tenantID, r.RemoteAddr, mw.Event{
		Action: "tenant.created", EntityType: "tenant", EntityID: tenantID,
		After: map[string]string{"name": req.TenantName, "owner_email": req.OwnerEmail},
	})

	// Add the new tenant CA to the Caddy trust pool so its devices can
	// authenticate via mTLS. Run in the request goroutine but do not fail
	// the response if reload hiccups — Caddy will pick up the new file on
	// next restart even without a live reload.
	if h.TrustPool != nil {
		if err := h.TrustPool.Rebuild(r.Context()); err != nil {
			slog.Warn("trust pool rebuild after tenant create failed", "err", err, "tenant", tenantID)
		}
	}

	writeJSON(w, http.StatusOK, createTenantResp{
		TenantID:   tenantID,
		UserID:     userID,
		InviteCode: inviteCode,
	})
}

// newInviteCode returns a 16-char Crockford-base32 invite code.
func newInviteCode() (string, error) {
	b := make([]byte, 10)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	enc := base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(b)
	return strings.ToUpper(enc), nil
}
