package api

import (
	"database/sql"
	"errors"
	"net/http"
	"time"

	"github.com/bookeeper/bookeeper-neo/server/internal/auth"
	"github.com/bookeeper/bookeeper-neo/server/internal/mw"
)

// AuthHandlers covers session lifecycle on the authenticated surface (mTLS).
//
// Login is intentionally simple: the device is already cryptographically
// proven by mTLS — we only need to verify the user owns the device and
// re-issue a fresh JWT pair. Refresh swaps the pair and audits the event.
type AuthHandlers struct {
	DB     *sql.DB
	Issuer *auth.Issuer
	Audit  *mw.Audit
}

type loginReq struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type tokenResp struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
}

// Login (mTLS) — re-authenticates the user bound to the calling device.
//
// The cert already proves the device; the password is required so a stolen
// laptop cannot be used without knowing the user password.
func (h *AuthHandlers) Login(w http.ResponseWriter, r *http.Request) {
	id, ok := mw.FromContext(r.Context())
	if !ok {
		writeErr(w, http.StatusUnauthorized, "no identity")
		return
	}
	var req loginReq
	if !readJSON(w, r, &req) {
		return
	}
	var pwHash, email string
	err := h.DB.QueryRowContext(r.Context(),
		`SELECT email, password_hash FROM users WHERE id = ? AND tenant_id = ?`,
		id.UserID, id.TenantID,
	).Scan(&email, &pwHash)
	if errors.Is(err, sql.ErrNoRows) {
		writeErr(w, http.StatusUnauthorized, "invalid credentials")
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}
	if email != req.Email || auth.VerifyPassword(req.Password, pwHash) != nil {
		writeErr(w, http.StatusUnauthorized, "invalid credentials")
		return
	}
	access, refresh, err := h.Issuer.Issue(id.TenantID, id.UserID, id.DeviceID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "issue failed")
		return
	}
	_ = h.Audit.Write(r.Context(), mw.Event{Action: "auth.login"})
	writeJSON(w, http.StatusOK, tokenResp{AccessToken: access, RefreshToken: refresh})
}

type refreshReq struct {
	RefreshToken string `json:"refresh_token"`
}

// Refresh swaps a refresh token for a new access+refresh pair, requiring the
// refresh JWT to match the calling device.
func (h *AuthHandlers) Refresh(w http.ResponseWriter, r *http.Request) {
	id, ok := mw.FromContext(r.Context())
	if !ok {
		writeErr(w, http.StatusUnauthorized, "no identity")
		return
	}
	var req refreshReq
	if !readJSON(w, r, &req) {
		return
	}
	claims, err := h.Issuer.Parse(req.RefreshToken, "refresh")
	if err != nil {
		writeErr(w, http.StatusUnauthorized, "invalid refresh")
		return
	}
	if claims.DeviceID != id.DeviceID || claims.TenantID != id.TenantID || claims.UserID != id.UserID {
		writeErr(w, http.StatusUnauthorized, "refresh/device mismatch")
		return
	}
	access, refresh, err := h.Issuer.Issue(id.TenantID, id.UserID, id.DeviceID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "issue failed")
		return
	}
	writeJSON(w, http.StatusOK, tokenResp{AccessToken: access, RefreshToken: refresh})
}

// Logout updates last_seen and writes an audit row. Tokens are stateless so
// the client must discard them locally; revoking the device cuts mTLS.
func (h *AuthHandlers) Logout(w http.ResponseWriter, r *http.Request) {
	id, ok := mw.FromContext(r.Context())
	if !ok {
		writeErr(w, http.StatusUnauthorized, "no identity")
		return
	}
	_, _ = h.DB.ExecContext(r.Context(),
		`UPDATE devices SET last_seen = ? WHERE id = ?`, time.Now().Unix(), id.DeviceID)
	_ = h.Audit.Write(r.Context(), mw.Event{Action: "auth.logout"})
	w.WriteHeader(http.StatusNoContent)
}
