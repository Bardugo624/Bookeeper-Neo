package embedded

import (
	"bytes"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"net/http"
	"testing"
)

// TestLocalFlow copre il percorso "libreria locale" end-to-end: avvio del
// server embedded, creazione tenant, pairing desktop via CSR e chiamata
// autenticata con X-Client-Cert (senza Caddy/mTLS).
func TestLocalFlow(t *testing.T) {
	srv, err := Start(t.TempDir())
	if err != nil {
		t.Fatalf("start: %v", err)
	}
	defer srv.Close()

	post := func(url string, body map[string]string, out any) {
		t.Helper()
		b, _ := json.Marshal(body)
		resp, err := http.Post(url, "application/json", bytes.NewReader(b))
		if err != nil {
			t.Fatalf("POST %s: %v", url, err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != 200 {
			var e map[string]any
			_ = json.NewDecoder(resp.Body).Decode(&e)
			t.Fatalf("POST %s: status %d (%v)", url, resp.StatusCode, e)
		}
		if err := json.NewDecoder(resp.Body).Decode(out); err != nil {
			t.Fatalf("decode: %v", err)
		}
	}

	// 1. Tenant.
	var setup struct {
		TenantID   string `json:"tenant_id"`
		InviteCode string `json:"invite_code"`
	}
	post(BootURL+"/setup/tenant", map[string]string{
		"tenant_name":    "Libreria Test",
		"admin_password": "admin-password-locale",
		"owner_email":    "test@example.com",
		"owner_name":     "Tester",
		"owner_password": "password8",
	}, &setup)

	// 2. Pairing con CSR.
	priv, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	der, _ := x509.CreateCertificateRequest(rand.Reader, &x509.CertificateRequest{
		Subject: pkix.Name{CommonName: "test-device"},
	}, priv)
	csrPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE REQUEST", Bytes: der})

	var pair struct {
		CertPEM     string `json:"cert_pem"`
		AccessToken string `json:"access_token"`
	}
	post(BootURL+"/pairing/bootstrap-desktop", map[string]string{
		"invite_code":    setup.InviteCode,
		"email":          "test@example.com",
		"password":       "password8",
		"admin_password": "admin-password-locale",
		"device_name":    "test-device",
		"csr_pem":        string(csrPEM),
	}, &pair)

	// 3. Chiamata autenticata: cert nel header (come fa il client locale).
	block, _ := pem.Decode([]byte(pair.CertPEM))
	req, _ := http.NewRequest("GET", AuthURL+"/api/v1/me", nil)
	req.Header.Set("X-Client-Cert", base64.StdEncoding.EncodeToString(block.Bytes))
	req.Header.Set("Authorization", "Bearer "+pair.AccessToken)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("GET /me: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		t.Fatalf("GET /me: status %d", resp.StatusCode)
	}
	var me struct {
		TenantID string `json:"tenant_id"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&me); err != nil {
		t.Fatalf("decode /me: %v", err)
	}
	if me.TenantID != setup.TenantID {
		t.Fatalf("tenant mismatch: %s != %s", me.TenantID, setup.TenantID)
	}
}
