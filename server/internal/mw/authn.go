// Package mw contains HTTP middleware for tenancy, authentication, and audit.
//
// Trust model: Caddy in front terminates mTLS and forwards the client leaf
// cert in the X-Client-Cert header (URL-encoded PEM). The middleware looks
// up the matching device row by certificate serial, then expects a JWT in
// Authorization: Bearer ... whose `did` claim matches that device. Both the
// device record and JWT must agree before the request is admitted.
//
// The bootstrap and pairing endpoints are mounted on a separate non-mTLS
// listener (port 8080 in deploy/Caddyfile) and skip these middlewares.
package mw

import (
	"context"
	"crypto/x509"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/pem"
	"errors"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/bookeeper/bookeeper-neo/server/internal/auth"
)

type ctxKey string

const (
	ctxKeyTenant ctxKey = "tenant_id"
	ctxKeyUser   ctxKey = "user_id"
	ctxKeyDevice ctxKey = "device_id"
	ctxKeyIP     ctxKey = "ip"
)

// Identity is the authenticated principal extracted from a request.
type Identity struct {
	TenantID string
	UserID   string
	DeviceID string
	IP       string
}

// FromContext returns the identity attached by Authn. The boolean is false
// for unauthenticated requests (bootstrap/pairing endpoints).
func FromContext(ctx context.Context) (Identity, bool) {
	tid, ok := ctx.Value(ctxKeyTenant).(string)
	if !ok {
		return Identity{}, false
	}
	uid, _ := ctx.Value(ctxKeyUser).(string)
	did, _ := ctx.Value(ctxKeyDevice).(string)
	ip, _ := ctx.Value(ctxKeyIP).(string)
	return Identity{TenantID: tid, UserID: uid, DeviceID: did, IP: ip}, true
}

// Authn validates client cert + JWT and stores the identity in request context.
//
// Required headers (set by Caddy):
//   - X-Client-Cert: URL-encoded leaf cert PEM
//   - Authorization: Bearer <access JWT>
//
// On success the request context carries TenantID/UserID/DeviceID.
type Authn struct {
	DB     *sql.DB
	Issuer *auth.Issuer
}

func (a *Authn) Wrap(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		serial, err := serialFromHeader(r.Header.Get("X-Client-Cert"))
		if err != nil {
			http.Error(w, "missing or invalid client cert", http.StatusUnauthorized)
			return
		}

		var tenantID, userID, deviceID string
		var revokedAt sql.NullInt64
		err = a.DB.QueryRowContext(r.Context(),
			`SELECT tenant_id, user_id, id, revoked_at FROM devices WHERE cert_serial = ?`,
			serial,
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

		// /auth/login and /auth/refresh are cert-only: the client has no
		// access JWT yet (or it's expired). They authenticate via mTLS +
		// password (login) or refresh token (refresh) at the handler level.
		certOnly := r.URL.Path == "/api/v1/auth/login" || r.URL.Path == "/api/v1/auth/refresh"

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
			// The JWT must agree with the cert it was bound to at login.
			if claims.DeviceID != deviceID || claims.TenantID != tenantID || claims.UserID != userID {
				http.Error(w, "token/device mismatch", http.StatusUnauthorized)
				return
			}
		}

		// Touch last_seen (best-effort, ignore error).
		_, _ = a.DB.ExecContext(r.Context(),
			`UPDATE devices SET last_seen = ? WHERE id = ?`, time.Now().Unix(), deviceID)

		ctx := context.WithValue(r.Context(), ctxKeyTenant, tenantID)
		ctx = context.WithValue(ctx, ctxKeyUser, userID)
		ctx = context.WithValue(ctx, ctxKeyDevice, deviceID)
		ctx = context.WithValue(ctx, ctxKeyIP, clientIP(r))
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// serialFromHeader decodes the leaf cert passed by Caddy in X-Client-Cert
// and returns its lowercase-hex serial number. Accepts two formats for
// compatibility:
//   - base64(DER) — current Caddy config (no newlines, valid HTTP header)
//   - URL-encoded PEM — legacy fallback
func serialFromHeader(headerVal string) (string, error) {
	if headerVal == "" {
		return "", errors.New("no cert")
	}
	var der []byte
	// Try base64(DER) first (current format).
	if b, err := base64.StdEncoding.DecodeString(headerVal); err == nil && len(b) > 0 {
		der = b
	} else {
		// Fallback: URL-encoded PEM.
		pemBytes, err := url.QueryUnescape(headerVal)
		if err != nil {
			return "", err
		}
		block, _ := pem.Decode([]byte(pemBytes))
		if block == nil {
			return "", errors.New("not pem and not base64")
		}
		der = block.Bytes
	}
	cert, err := x509.ParseCertificate(der)
	if err != nil {
		return "", err
	}
	return hex.EncodeToString(cert.SerialNumber.Bytes()), nil
}

func clientIP(r *http.Request) string {
	if v := r.Header.Get("X-Forwarded-For"); v != "" {
		if i := strings.IndexByte(v, ','); i > 0 {
			return strings.TrimSpace(v[:i])
		}
		return strings.TrimSpace(v)
	}
	return r.RemoteAddr
}
