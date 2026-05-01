package mw

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/bookeeper/bookeeper-neo/server/internal/auth"
)

// MobileAuthn validates the mobile PWA surface (mounted on the bootstrap
// listener under /api/v1/m/*).
//
// Trust model differs from desktop Authn:
//
//   - Browsers cannot present X.509 client certificates for arbitrary fetch()
//     calls (no JS API for selecting a key — Web Crypto cannot be wired into
//     the TLS layer). Caddy in front of /m therefore runs with
//     `client_auth.mode = request` (not require_and_verify) and the
//     certificate header is empty for these requests.
//
//   - Instead, the PWA computes the SHA-256 hex of its own certificate DER
//     at pairing time (matches devices.cert_fingerprint set server-side by
//     ca.IssueClient) and sends it as `X-Device-Cert-Fingerprint` on every
//     request, alongside the JWT bearer.
//
// Both must agree: the JWT `did` claim is matched against the device row
// looked up by fingerprint. The fingerprint header is not a secret on its
// own (the server already exposes it via /api/v1/devices), but combined
// with a non-extractable EC P-256 private key in IndexedDB and HTTPS in
// transit it ties the JWT to the device that holds the matching key.
//
// Endpoints exempt from JWT verification (cert-only / pre-auth) can be
// added the same way Authn does it for /auth/refresh, but mobile callers
// always have a fresh JWT from /pairing/redeem so we keep this strict.
type MobileAuthn struct {
	DB     *sql.DB
	Issuer *auth.Issuer
}

// hex sha256 = 64 lowercase hex chars; reject anything else fast.
var fingerprintRE = regexp.MustCompile(`^[0-9a-f]{64}$`)

func (a *MobileAuthn) Wrap(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fp := strings.ToLower(strings.TrimSpace(r.Header.Get("X-Device-Cert-Fingerprint")))
		if !fingerprintRE.MatchString(fp) {
			http.Error(w, "missing or invalid device fingerprint", http.StatusUnauthorized)
			return
		}

		var tenantID, userID, deviceID string
		var revokedAt sql.NullInt64
		err := a.DB.QueryRowContext(r.Context(),
			`SELECT tenant_id, user_id, id, revoked_at FROM devices WHERE cert_fingerprint = ? AND kind = 'mobile'`,
			fp,
		).Scan(&tenantID, &userID, &deviceID, &revokedAt)
		if errors.Is(err, sql.ErrNoRows) {
			http.Error(w, "device not registered", http.StatusUnauthorized)
			return
		}
		if err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
		if revokedAt.Valid {
			http.Error(w, "device revoked", http.StatusForbidden)
			return
		}

		// /m/auth/refresh is the only mobile route that can run with an
		// expired access token (it consumes the refresh token instead).
		// Everything else requires a current bearer.
		certOnly := r.URL.Path == "/api/v1/m/auth/refresh"

		raw := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		if !certOnly {
			if raw == "" || raw == r.Header.Get("Authorization") {
				http.Error(w, "missing access token", http.StatusUnauthorized)
				return
			}
			claims, err := a.Issuer.Parse(raw, "access")
			if err != nil {
				http.Error(w, "invalid access token", http.StatusUnauthorized)
				return
			}
			if claims.DeviceID != deviceID || claims.TenantID != tenantID || claims.UserID != userID {
				http.Error(w, "token/device mismatch", http.StatusUnauthorized)
				return
			}
		}

		_, _ = a.DB.ExecContext(r.Context(),
			`UPDATE devices SET last_seen = ? WHERE id = ?`, time.Now().Unix(), deviceID)

		ctx := context.WithValue(r.Context(), ctxKeyTenant, tenantID)
		ctx = context.WithValue(ctx, ctxKeyUser, userID)
		ctx = context.WithValue(ctx, ctxKeyDevice, deviceID)
		ctx = context.WithValue(ctx, ctxKeyIP, clientIP(r))
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
