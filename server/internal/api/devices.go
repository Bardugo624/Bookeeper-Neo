package api

import (
	"crypto/sha256"
	"crypto/x509"
	"database/sql"
	"encoding/hex"
	"encoding/pem"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/bookeeper/bookeeper-neo/server/internal/ca"
	"github.com/bookeeper/bookeeper-neo/server/internal/mw"
)

// DeviceHandlers serve device management on the authenticated surface:
//
//   - List devices in the tenant
//   - Create a one-shot pairing token (returned alongside the server's CA
//     fingerprint so the client can render a QR payload)
//   - Revoke a device (deletes its mTLS access; CRL is regenerated on demand)
type DeviceHandlers struct {
	DB         *sql.DB
	Audit      *mw.Audit
	CAStore    *ca.Store
	PairingTTL time.Duration
	ServerHost string
	ServerPort int
}

type deviceDTO struct {
	ID              string `json:"id"`
	Name            string `json:"name"`
	Kind            string `json:"kind"`
	UserID          string `json:"user_id"`
	CertFingerprint string `json:"cert_fingerprint"`
	PairedAt        int64  `json:"paired_at"`
	LastSeen        *int64 `json:"last_seen,omitempty"`
	Revoked         bool   `json:"revoked"`
}

func (h *DeviceHandlers) List(w http.ResponseWriter, r *http.Request) {
	id, ok := mw.FromContext(r.Context())
	if !ok {
		writeErr(w, http.StatusUnauthorized, "no identity")
		return
	}
	rows, err := h.DB.QueryContext(r.Context(), `
        SELECT id, name, kind, user_id, cert_fingerprint, paired_at, last_seen, revoked_at
          FROM devices WHERE tenant_id = ?
          ORDER BY paired_at DESC
    `, id.TenantID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}
	defer rows.Close()

	out := []deviceDTO{}
	for rows.Next() {
		var d deviceDTO
		var lastSeen, revoked sql.NullInt64
		if err := rows.Scan(&d.ID, &d.Name, &d.Kind, &d.UserID, &d.CertFingerprint, &d.PairedAt, &lastSeen, &revoked); err != nil {
			writeErr(w, http.StatusInternalServerError, "scan error")
			return
		}
		if lastSeen.Valid {
			v := lastSeen.Int64
			d.LastSeen = &v
		}
		d.Revoked = revoked.Valid
		out = append(out, d)
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"devices": out})
}

type pairTokenResp struct {
	Token             string `json:"token"`
	ExpiresAt         int64  `json:"expires_at"`
	PairingURL        string `json:"pairing_url"`        // bootstrap port URL
	ServerFingerprint string `json:"server_fingerprint"` // CA cert sha256 (hex)
	QRPayload         string `json:"qr_payload"`         // https://<host>/m/?pair=<token>
}

// pairTokenStatusResp surfaces redemption progress to the desktop UI so it
// can show a live "Device paired" indicator while the QR is on screen.
type pairTokenStatusResp struct {
	Used       bool   `json:"used"`
	Expired    bool   `json:"expired"`
	DeviceID   string `json:"device_id,omitempty"`
	DeviceName string `json:"device_name,omitempty"`
	UsedAt     int64  `json:"used_at,omitempty"`
}

// CreatePairingToken returns a fresh token bound to the calling user. The
// client renders the qr_payload as a QR code; the mobile reads it, scans
// the server's fingerprint to pin trust, and calls /pairing/redeem.
func (h *DeviceHandlers) CreatePairingToken(w http.ResponseWriter, r *http.Request) {
	id, ok := mw.FromContext(r.Context())
	if !ok {
		writeErr(w, http.StatusUnauthorized, "no identity")
		return
	}
	tok, exp, err := NewPairingToken(h.DB, id.TenantID, id.UserID, "mobile", h.PairingTTL)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "token gen failed")
		return
	}
	fp, err := h.tenantCAFingerprint(r, id.TenantID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "fingerprint failed")
		return
	}
	bootstrapURL := "https://" + h.ServerHost + ":8080"
	publicURL := "https://" + h.ServerHost
	if h.ServerPort != 443 {
		publicURL += ":" + itoa(h.ServerPort)
	}
	// QR payload: pure HTTPS deep link. The phone's native camera app opens
	// it directly in browser; the mobile PWA at /m/ auto-redeems on load
	// when ?pair=<token> is present (see clients/mobile-web router guard).
	qr := publicURL + "/m/?pair=" + tok

	_ = h.Audit.Write(r.Context(), mw.Event{
		Action: "device.pairing_token_created", EntityType: "pairing_token", EntityID: tok[:8] + "...",
	})

	writeJSON(w, http.StatusOK, pairTokenResp{
		Token:             tok,
		ExpiresAt:         exp.Unix(),
		PairingURL:        bootstrapURL,
		ServerFingerprint: fp,
		QRPayload:         qr,
	})
}

// Revoke marks a device as revoked. Subsequent mTLS handshakes will be
// refused once Caddy refreshes the CRL (served at /crl.pem on the
// authenticated surface).
func (h *DeviceHandlers) Revoke(w http.ResponseWriter, r *http.Request) {
	id, ok := mw.FromContext(r.Context())
	if !ok {
		writeErr(w, http.StatusUnauthorized, "no identity")
		return
	}
	deviceID := chiURLParam(r, "id")
	if deviceID == "" {
		writeErr(w, http.StatusBadRequest, "missing id")
		return
	}
	res, err := h.DB.ExecContext(r.Context(),
		`UPDATE devices SET revoked_at = ? WHERE id = ? AND tenant_id = ? AND revoked_at IS NULL`,
		time.Now().Unix(), deviceID, id.TenantID,
	)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		writeErr(w, http.StatusNotFound, "device not found or already revoked")
		return
	}
	_ = h.Audit.Write(r.Context(), mw.Event{
		Action: "device.revoked", EntityType: "device", EntityID: deviceID,
	})
	w.WriteHeader(http.StatusNoContent)
}

// CRL serves the current Certificate Revocation List for the calling tenant.
// Caddy can be pointed at this endpoint to refresh trust regularly.
func (h *DeviceHandlers) CRL(w http.ResponseWriter, r *http.Request) {
	id, ok := mw.FromContext(r.Context())
	if !ok {
		writeErr(w, http.StatusUnauthorized, "no identity")
		return
	}
	caInst, ok := h.CAStore.Get(id.TenantID)
	if !ok {
		writeErr(w, http.StatusServiceUnavailable, "tenant CA locked")
		return
	}
	rows, err := h.DB.QueryContext(r.Context(),
		`SELECT cert_serial, revoked_at FROM devices WHERE tenant_id = ? AND revoked_at IS NOT NULL`,
		id.TenantID,
	)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}
	defer rows.Close()

	var revoked []ca.RevokedCert
	for rows.Next() {
		var serial string
		var ts int64
		if err := rows.Scan(&serial, &ts); err != nil {
			writeErr(w, http.StatusInternalServerError, "scan error")
			return
		}
		revoked = append(revoked, ca.RevokedCert{Serial: serial, RevokedAt: time.Unix(ts, 0)})
	}
	pemBytes, err := caInst.SignCRL(revoked)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "crl sign failed")
		return
	}
	w.Header().Set("Content-Type", "application/x-pem-file")
	_, _ = w.Write(pemBytes)
}

// tenantCAFingerprint reads the stored CA cert for the tenant and returns the
// sha256 hex of its DER. Used to display in QR codes for trust pinning.
func (h *DeviceHandlers) tenantCAFingerprint(r *http.Request, tenantID string) (string, error) {
	var certPEM string
	err := h.DB.QueryRowContext(r.Context(),
		`SELECT ca_cert_pem FROM tenants WHERE id = ?`, tenantID).Scan(&certPEM)
	if err != nil {
		return "", err
	}
	block, _ := pem.Decode([]byte(certPEM))
	if block == nil {
		return "", errors.New("invalid stored ca pem")
	}
	c, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(c.Raw)
	return hex.EncodeToString(sum[:]), nil
}

// PairingTokenStatus reports whether a pairing token has been redeemed,
// expired, or is still pending. Used by the desktop UI to show a live
// "device paired" indicator while the QR is on screen (polled every 2s).
//
// Token is scoped to the calling tenant: a desktop cannot peek at tokens
// belonging to another tenant even by guessing the (long) random string.
func (h *DeviceHandlers) PairingTokenStatus(w http.ResponseWriter, r *http.Request) {
	id, ok := mw.FromContext(r.Context())
	if !ok {
		writeErr(w, http.StatusUnauthorized, "no identity")
		return
	}
	token := chiURLParam(r, "token")
	if token == "" {
		writeErr(w, http.StatusBadRequest, "missing token")
		return
	}

	var expiresAt int64
	var usedAt sql.NullInt64
	err := h.DB.QueryRowContext(r.Context(), `
        SELECT expires_at, used_at
          FROM pairing_tokens
         WHERE token = ? AND tenant_id = ?
    `, token, id.TenantID).Scan(&expiresAt, &usedAt)
	if errors.Is(err, sql.ErrNoRows) {
		writeErr(w, http.StatusNotFound, "token not found")
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}

	resp := pairTokenStatusResp{
		Used:    usedAt.Valid,
		Expired: !usedAt.Valid && time.Now().Unix() > expiresAt,
	}
	if usedAt.Valid {
		resp.UsedAt = usedAt.Int64
		// Redemption inserts exactly one device row at this exact unix
		// timestamp for this tenant; fetch its name for live UI feedback.
		_ = h.DB.QueryRowContext(r.Context(), `
            SELECT id, name FROM devices
             WHERE tenant_id = ? AND paired_at = ?
             ORDER BY paired_at DESC LIMIT 1
        `, id.TenantID, usedAt.Int64).Scan(&resp.DeviceID, &resp.DeviceName)
	}
	writeJSON(w, http.StatusOK, resp)
}

// RenameMe updates the calling device's display name. Mounted on the mobile
// surface (PATCH /api/v1/m/devices/me); the desktop equivalent is the admin
// rename via /devices/{id} (planned). Body: {"name": "..."}.
func (h *DeviceHandlers) RenameMe(w http.ResponseWriter, r *http.Request) {
	id, ok := mw.FromContext(r.Context())
	if !ok {
		writeErr(w, http.StatusUnauthorized, "no identity")
		return
	}
	var req struct {
		Name string `json:"name"`
	}
	if !readJSON(w, r, &req) {
		return
	}
	name := strings.TrimSpace(req.Name)
	if name == "" || len(name) > 60 {
		writeErr(w, http.StatusBadRequest, "name 1..60 chars required")
		return
	}
	if _, err := h.DB.ExecContext(r.Context(),
		`UPDATE devices SET name = ? WHERE id = ? AND tenant_id = ?`,
		name, id.DeviceID, id.TenantID,
	); err != nil {
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}
	_ = h.Audit.Write(r.Context(), mw.Event{
		Action: "device.renamed", EntityType: "device", EntityID: id.DeviceID,
		After: map[string]string{"name": name},
	})
	writeJSON(w, http.StatusOK, map[string]string{"name": name})
}

func itoa(n int) string {
	// Tiny inline strconv to avoid importing in this small helper.
	if n == 0 {
		return "0"
	}
	var buf [20]byte
	pos := len(buf)
	neg := n < 0
	if neg {
		n = -n
	}
	for n > 0 {
		pos--
		buf[pos] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		pos--
		buf[pos] = '-'
	}
	return string(buf[pos:])
}
