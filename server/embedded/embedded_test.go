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
	"fmt"
	"io"
	"net/http"
	"testing"
)

// testClient replica il comportamento del client desktop in modalità
// locale: HTTP plain su loopback, cert nel header X-Client-Cert, JWT
// Bearer. Ogni feature dell'app passa da qui.
type testClient struct {
	t          *testing.T
	certHeader string
	access     string
}

func (c *testClient) do(method, url string, body any, out any) (status int) {
	c.t.Helper()
	var rdr io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rdr = bytes.NewReader(b)
	}
	req, _ := http.NewRequest(method, url, rdr)
	req.Header.Set("Content-Type", "application/json")
	if c.certHeader != "" {
		req.Header.Set("X-Client-Cert", c.certHeader)
	}
	if c.access != "" {
		req.Header.Set("Authorization", "Bearer "+c.access)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		c.t.Fatalf("%s %s: %v", method, url, err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if out != nil && len(raw) > 0 && resp.StatusCode < 400 {
		if err := json.Unmarshal(raw, out); err != nil {
			c.t.Fatalf("%s %s: decode: %v (body=%s)", method, url, err, raw)
		}
	}
	if resp.StatusCode >= 400 {
		c.t.Logf("%s %s → %d: %s", method, url, resp.StatusCode, raw)
	}
	return resp.StatusCode
}

func (c *testClient) mustDo(method, url string, body any, out any) {
	c.t.Helper()
	if st := c.do(method, url, body, out); st != 200 {
		c.t.Fatalf("%s %s: status %d (want 200)", method, url, st)
	}
}

// TestLocalFlow copre il percorso "libreria locale" end-to-end: avvio,
// creazione tenant, pairing, e POI ogni superficie funzionale dell'app
// (auth, libri, scaffali, wishlist, prestiti, statistiche, tenant,
// dispositivi) esattamente come le usa il client desktop.
func TestLocalFlow(t *testing.T) {
	dataDir := t.TempDir()
	srv, err := Start(dataDir)
	if err != nil {
		t.Fatalf("start: %v", err)
	}
	defer srv.Close()

	const (
		adminPwd = "admin-password-locale"
		email    = "test@example.com"
		userPwd  = "password8"
	)

	c := &testClient{t: t}

	// ---- Setup tenant --------------------------------------------------
	var setup struct {
		TenantID   string `json:"tenant_id"`
		InviteCode string `json:"invite_code"`
	}
	c.mustDo("POST", BootURL+"/setup/tenant", map[string]string{
		"tenant_name":    "Libreria Test",
		"admin_password": adminPwd,
		"owner_email":    email,
		"owner_name":     "Tester",
		"owner_password": userPwd,
	}, &setup)

	// ---- Pairing desktop (CSR) ----------------------------------------
	priv, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	der, _ := x509.CreateCertificateRequest(rand.Reader, &x509.CertificateRequest{
		Subject: pkix.Name{CommonName: "test-device"},
	}, priv)
	csrPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE REQUEST", Bytes: der})

	var pair struct {
		CertPEM      string `json:"cert_pem"`
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
	}
	c.mustDo("POST", BootURL+"/pairing/bootstrap-desktop", map[string]string{
		"invite_code":    setup.InviteCode,
		"email":          email,
		"password":       userPwd,
		"admin_password": adminPwd,
		"device_name":    "test-device",
		"csr_pem":        string(csrPEM),
	}, &pair)

	block, _ := pem.Decode([]byte(pair.CertPEM))
	c.certHeader = base64.StdEncoding.EncodeToString(block.Bytes)
	c.access = pair.AccessToken

	// ---- /me -----------------------------------------------------------
	var me struct {
		TenantID string `json:"tenant_id"`
	}
	c.mustDo("GET", AuthURL+"/api/v1/me", nil, &me)
	if me.TenantID != setup.TenantID {
		t.Fatalf("tenant mismatch: %s != %s", me.TenantID, setup.TenantID)
	}

	// ---- Auth: login (cert-only) + refresh ------------------------------
	var tokens struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
	}
	loginC := &testClient{t: t, certHeader: c.certHeader} // niente Bearer
	loginC.mustDo("POST", AuthURL+"/api/v1/auth/login", map[string]any{
		"email": email, "password": userPwd,
	}, &tokens)
	c.access = tokens.AccessToken
	c.mustDo("POST", AuthURL+"/api/v1/auth/refresh", map[string]string{
		"refresh_token": tokens.RefreshToken,
	}, &tokens)
	c.access = tokens.AccessToken

	// ---- Libri: create, list, get, update, next-progressive -------------
	var book struct {
		ID string `json:"id"`
	}
	c.mustDo("POST", AuthURL+"/api/v1/books/", map[string]any{
		"title":              "Il nome della rosa",
		"authors":            []string{"Umberto Eco"},
		"isbn_13":            "9788845292613",
		"published_year":     1980,
		"progressive_number": 1,
	}, &book)
	if book.ID == "" {
		t.Fatal("book create: no id")
	}
	var list struct {
		Books []map[string]any `json:"books"`
	}
	c.mustDo("GET", AuthURL+"/api/v1/books/", nil, &list)
	if len(list.Books) != 1 {
		t.Fatalf("books list: got %d, want 1", len(list.Books))
	}
	c.mustDo("GET", AuthURL+"/api/v1/books/"+book.ID, nil, nil)
	// L'update è full-replace (il client invia sempre il BookInput completo).
	c.mustDo("PATCH", AuthURL+"/api/v1/books/"+book.ID, map[string]any{
		"title":              "Il nome della rosa",
		"authors":            []string{"Umberto Eco"},
		"isbn_13":            "9788845292613",
		"published_year":     1980,
		"progressive_number": 1,
		"notes":              "prima edizione",
	}, nil)
	// Ricerca FTS (il titolo aggiornato deve essere indicizzato).
	var found struct {
		Books []map[string]any `json:"books"`
	}
	c.mustDo("GET", AuthURL+"/api/v1/books/?q=rosa", nil, &found)
	if len(found.Books) != 1 {
		t.Fatalf("fts search: got %d, want 1", len(found.Books))
	}
	var next struct {
		Next int `json:"next"`
	}
	c.mustDo("GET", AuthURL+"/api/v1/books/next-progressive", nil, &next)
	if next.Next != 2 {
		t.Fatalf("next-progressive: got %d, want 2", next.Next)
	}

	// ---- Scaffali: create, assign, list books ---------------------------
	var shelf struct {
		ID string `json:"id"`
	}
	c.mustDo("POST", AuthURL+"/api/v1/shelves/", map[string]any{
		"name": "Narrativa", "rows": 3, "slots_per_row": 10, "color": "sage",
	}, &shelf)
	c.mustDo("PATCH", AuthURL+"/api/v1/books/"+book.ID+"/shelf", map[string]any{
		"shelf_id": shelf.ID, "row_index": 0, "slot_index": 0, "spine_width": 1,
	}, nil)
	var shelfBooks struct {
		Books []map[string]any `json:"books"`
	}
	c.mustDo("GET", AuthURL+"/api/v1/shelves/"+shelf.ID+"/books", nil, &shelfBooks)
	if len(shelfBooks.Books) != 1 {
		t.Fatalf("shelf books: got %d, want 1", len(shelfBooks.Books))
	}

	// ---- Wishlist: create + convert --------------------------------------
	var wish struct {
		ID string `json:"id"`
	}
	c.mustDo("POST", AuthURL+"/api/v1/wishlist/", map[string]any{
		"title": "Baudolino", "authors": "Umberto Eco", "priority": 1,
	}, &wish)
	c.mustDo("POST", AuthURL+"/api/v1/wishlist/"+wish.ID+"/convert", map[string]any{}, nil)

	// ---- Prestiti: create + return ---------------------------------------
	var loan struct {
		ID string `json:"id"`
	}
	c.mustDo("POST", AuthURL+"/api/v1/loans/", map[string]any{
		"book_id": book.ID, "borrower_name": "Anna", "lent_at": 1700000000,
	}, &loan)
	c.mustDo("POST", AuthURL+"/api/v1/loans/"+loan.ID+"/return", map[string]any{
		"returned_at": 1700100000,
	}, nil)

	// ---- Statistiche ------------------------------------------------------
	c.mustDo("GET", AuthURL+"/api/v1/stats", nil, nil)

	// ---- Tenant: get + rotate invite (admin password locale) --------------
	var tinfo struct {
		InviteCode string `json:"invite_code"`
	}
	c.mustDo("GET", AuthURL+"/api/v1/tenant/", nil, &tinfo)
	if tinfo.InviteCode != setup.InviteCode {
		t.Fatalf("tenant invite mismatch")
	}
	var rotated struct {
		InviteCode string `json:"invite_code"`
	}
	c.mustDo("POST", AuthURL+"/api/v1/tenant/rotate-invite", map[string]string{
		"admin_password": adminPwd,
	}, &rotated)
	if rotated.InviteCode == setup.InviteCode {
		t.Fatal("rotate-invite: code unchanged")
	}

	// ---- Dispositivi: list + pairing token (CA sbloccata in memoria) ------
	var devs struct {
		Devices []map[string]any `json:"devices"`
	}
	c.mustDo("GET", AuthURL+"/api/v1/devices/", nil, &devs)
	if len(devs.Devices) != 1 {
		t.Fatalf("devices: got %d, want 1", len(devs.Devices))
	}
	var ptok struct {
		Token     string `json:"token"`
		QRPayload string `json:"qr_payload"`
	}
	c.mustDo("POST", AuthURL+"/api/v1/devices/pairing-token", map[string]any{}, &ptok)
	if ptok.Token == "" {
		t.Fatal("pairing token empty")
	}

	// ---- Riavvio: auto-unlock del CA dal server key slot ------------------
	// Chiudi e riapri sullo stesso dataDir: il CA deve tornare in memoria
	// senza admin password (slot server-key), e il pairing token deve
	// continuare a poter essere emesso.
	srv.Close()
	srv2, err2 := Start(dataDir)
	if err2 != nil {
		t.Fatalf("restart: %v", err2)
	}
	defer srv2.Close()
	// Il vecchio access token resta valido (stesso jwt.key persistito).
	c.mustDo("POST", AuthURL+"/api/v1/devices/pairing-token", map[string]any{}, &ptok)

	fmt.Println("local flow ok")
}
