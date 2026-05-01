package api

import (
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"errors"
	"net/http"
	"time"

	"github.com/google/uuid"

	"github.com/bookeeper/bookeeper-neo/server/internal/auth"
	"github.com/bookeeper/bookeeper-neo/server/internal/ca"
	"github.com/bookeeper/bookeeper-neo/server/internal/mw"
)

// PairingHandlers serves the unauthenticated bootstrap & redemption endpoints
// (port :8080, no mTLS). These are the ONLY endpoints reachable without a
// previously-issued client certificate.
type PairingHandlers struct {
	DB         *sql.DB
	Audit      *mw.Audit
	Issuer     *auth.Issuer
	CAStore    *ca.Store
	PairingTTL time.Duration
}

type pairingResp struct {
	DeviceID     string `json:"device_id"`
	CertPEM      string `json:"cert_pem"`
	CACertPEM    string `json:"ca_cert_pem"`
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
}

// --- POST /pairing/bootstrap-desktop ---
//
// Pairs a desktop client. Identified by tenant invite_code + user email +
// password + tenant admin password (which unlocks the CA).

type bootstrapDesktopReq struct {
	InviteCode    string `json:"invite_code"`
	Email         string `json:"email"`
	Password      string `json:"password"`
	AdminPassword string `json:"admin_password"`
	DeviceName    string `json:"device_name"`
	CSRPem        string `json:"csr_pem"`
}

func (h *PairingHandlers) BootstrapDesktop(w http.ResponseWriter, r *http.Request) {
	var req bootstrapDesktopReq
	if !readJSON(w, r, &req) {
		return
	}
	if req.InviteCode == "" || req.Email == "" || req.Password == "" ||
		req.AdminPassword == "" || req.CSRPem == "" {
		writeErr(w, http.StatusBadRequest, "missing fields")
		return
	}

	var tenantID, certPEM string
	var keyEnc, keySalt, keyNonce []byte
	err := h.DB.QueryRowContext(r.Context(), `
        SELECT id, ca_cert_pem, ca_key_enc, ca_key_salt, ca_key_nonce
          FROM tenants WHERE invite_code = ?
    `, req.InviteCode).Scan(&tenantID, &certPEM, &keyEnc, &keySalt, &keyNonce)
	if errors.Is(err, sql.ErrNoRows) {
		writeErr(w, http.StatusUnauthorized, "invalid invite code")
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}

	var userID, pwHash string
	err = h.DB.QueryRowContext(r.Context(),
		`SELECT id, password_hash FROM users WHERE tenant_id = ? AND email = ?`,
		tenantID, req.Email,
	).Scan(&userID, &pwHash)
	if errors.Is(err, sql.ErrNoRows) {
		writeErr(w, http.StatusUnauthorized, "invalid credentials")
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}
	if auth.VerifyPassword(req.Password, pwHash) != nil {
		writeErr(w, http.StatusUnauthorized, "invalid credentials")
		return
	}

	caInst, err := ca.Unlock([]byte(certPEM), keyEnc, keySalt, keyNonce, req.AdminPassword)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, "invalid admin password")
		return
	}
	csr, err := ca.ParseCSR([]byte(req.CSRPem))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid csr")
		return
	}
	deviceID := uuid.NewString()
	issued, err := caInst.IssueClient(csr, tenantID, userID, deviceID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "ca issue failed")
		return
	}

	if _, err := h.DB.ExecContext(r.Context(), `
        INSERT INTO devices (id, tenant_id, user_id, name, kind, cert_serial, cert_fingerprint, paired_at)
        VALUES (?, ?, ?, ?, 'desktop', ?, ?, ?)
    `, deviceID, tenantID, userID, req.DeviceName,
		issued.Serial, issued.Fingerprint, time.Now().Unix(),
	); err != nil {
		writeErr(w, http.StatusInternalServerError, "device persist failed")
		return
	}

	// Cache the unlocked CA so subsequent mobile pairings (no admin password)
	// can issue certs.
	h.CAStore.Set(tenantID, caInst)

	access, refresh, err := h.Issuer.Issue(tenantID, userID, deviceID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "token issue failed")
		return
	}

	_ = h.Audit.WriteAnon(r.Context(), tenantID, r.RemoteAddr, mw.Event{
		Action: "device.paired", EntityType: "device", EntityID: deviceID,
		After: map[string]string{"kind": "desktop", "name": req.DeviceName, "user_id": userID},
	})

	writeJSON(w, http.StatusOK, pairingResp{
		DeviceID:     deviceID,
		CertPEM:      string(issued.CertPEM),
		CACertPEM:    certPEM,
		AccessToken:  access,
		RefreshToken: refresh,
	})
}

// --- POST /pairing/redeem ---
//
// Redeems a one-shot pairing token (created by an authenticated desktop and
// shown as a QR code) to issue a mobile client cert. The tenant CA must be
// already unlocked in memory.

type redeemReq struct {
	Token      string `json:"token"`
	DeviceName string `json:"device_name"`
	CSRPem     string `json:"csr_pem"`
}

func (h *PairingHandlers) Redeem(w http.ResponseWriter, r *http.Request) {
	var req redeemReq
	if !readJSON(w, r, &req) {
		return
	}
	if req.Token == "" || req.CSRPem == "" {
		writeErr(w, http.StatusBadRequest, "missing fields")
		return
	}

	tx, err := h.DB.BeginTx(r.Context(), nil)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}
	defer func() { _ = tx.Rollback() }()

	var tenantID, userID, kind string
	var expiresAt int64
	var usedAt sql.NullInt64
	err = tx.QueryRowContext(r.Context(), `
        SELECT tenant_id, user_id, device_kind, expires_at, used_at
          FROM pairing_tokens WHERE token = ?
    `, req.Token).Scan(&tenantID, &userID, &kind, &expiresAt, &usedAt)
	if errors.Is(err, sql.ErrNoRows) {
		writeErr(w, http.StatusUnauthorized, "invalid token")
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}
	if usedAt.Valid {
		writeErr(w, http.StatusUnauthorized, "token already used")
		return
	}
	if time.Now().Unix() > expiresAt {
		writeErr(w, http.StatusUnauthorized, "token expired")
		return
	}

	caInst, ok := h.CAStore.Get(tenantID)
	if !ok {
		writeErr(w, http.StatusServiceUnavailable, "tenant CA locked; sign in on desktop first")
		return
	}

	csr, err := ca.ParseCSR([]byte(req.CSRPem))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid csr")
		return
	}
	deviceID := uuid.NewString()
	issued, err := caInst.IssueClient(csr, tenantID, userID, deviceID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "ca issue failed")
		return
	}

	now := time.Now().Unix()
	if _, err := tx.ExecContext(r.Context(), `
        INSERT INTO devices (id, tenant_id, user_id, name, kind, cert_serial, cert_fingerprint, paired_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, deviceID, tenantID, userID, req.DeviceName, kind,
		issued.Serial, issued.Fingerprint, now); err != nil {
		writeErr(w, http.StatusInternalServerError, "device persist failed")
		return
	}
	if _, err := tx.ExecContext(r.Context(),
		`UPDATE pairing_tokens SET used_at = ? WHERE token = ?`, now, req.Token); err != nil {
		writeErr(w, http.StatusInternalServerError, "token consume failed")
		return
	}

	var caCertPEM string
	if err := tx.QueryRowContext(r.Context(),
		`SELECT ca_cert_pem FROM tenants WHERE id = ?`, tenantID).Scan(&caCertPEM); err != nil {
		writeErr(w, http.StatusInternalServerError, "tenant lookup failed")
		return
	}
	if err := tx.Commit(); err != nil {
		writeErr(w, http.StatusInternalServerError, "commit failed")
		return
	}

	access, refresh, err := h.Issuer.Issue(tenantID, userID, deviceID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "token issue failed")
		return
	}

	_ = h.Audit.WriteAnon(r.Context(), tenantID, r.RemoteAddr, mw.Event{
		Action: "device.paired", EntityType: "device", EntityID: deviceID,
		After: map[string]string{"kind": kind, "name": req.DeviceName, "user_id": userID},
	})

	writeJSON(w, http.StatusOK, pairingResp{
		DeviceID:     deviceID,
		CertPEM:      string(issued.CertPEM),
		CACertPEM:    caCertPEM,
		AccessToken:  access,
		RefreshToken: refresh,
	})
}

// NewPairingToken creates and persists a fresh one-shot pairing token,
// callable from authenticated handlers.
func NewPairingToken(db *sql.DB, tenantID, userID, kind string, ttl time.Duration) (string, time.Time, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", time.Time{}, err
	}
	tok := base64.RawURLEncoding.EncodeToString(raw)
	exp := time.Now().Add(ttl)
	_, err := db.Exec(`
        INSERT INTO pairing_tokens (token, tenant_id, user_id, device_kind, expires_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
    `, tok, tenantID, userID, kind, exp.Unix(), time.Now().Unix())
	return tok, exp, err
}
