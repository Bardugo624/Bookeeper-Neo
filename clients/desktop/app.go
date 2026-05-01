package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"sync"

	"desktop/internal/csr"
	"desktop/internal/httpclient"
	"desktop/internal/session"
)

// App è la radice esposta a JS via Wails bindings. Mantiene lo stato
// crittografico in memoria (mTLS http.Client) e su disco (session.Identity).
//
// Tutti i metodi pubblici sono sicuri da chiamare in concorrenza grazie al
// mutex; in pratica il frontend serializza già le chiamate, ma è una
// piccola assicurazione contro race su login/logout simultanei.
type App struct {
	ctx context.Context

	mu     sync.RWMutex
	id     *session.Identity
	client *httpclient.Client
}

// NewApp costruisce l'istanza usata da main.go.
func NewApp() *App {
	return &App{}
}

// startup carica la sessione persistita (se presente) così la UI può
// saltare lo schermo di login.
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	id, err := session.Load()
	if err != nil {
		// Nessuna sessione: stato "primo avvio".
		return
	}
	cli, err := httpclient.New(id)
	if err != nil {
		// Identità corrotta: non bloccare l'avvio, ma non instanziare
		// il client. La UI vedrà HasSession()=false dopo Wipe.
		fmt.Fprintln(os.Stderr, "[startup] identity load failed:", err)
		_ = session.Wipe()
		return
	}
	a.id = id
	a.client = cli
}

// SessionInfo è il payload restituito a JS per descrivere lo stato di
// sessione (no segreti).
type SessionInfo struct {
	HasSession bool   `json:"has_session"`
	ServerURL  string `json:"server_url"`
	Email      string `json:"email"`
	UserID     string `json:"user_id"`
	TenantID   string `json:"tenant_id"`
	DeviceID   string `json:"device_id"`
}

// GetSession restituisce le info correnti (vuote se nessuna sessione).
func (a *App) GetSession() SessionInfo {
	a.mu.RLock()
	defer a.mu.RUnlock()
	if a.id == nil {
		return SessionInfo{}
	}
	return SessionInfo{
		HasSession: true,
		ServerURL:  a.id.ServerURL,
		Email:      a.id.Email,
		UserID:     a.id.UserID,
		TenantID:   a.id.TenantID,
		DeviceID:   a.id.DeviceID,
	}
}

// BootstrapDesktopReq mirrora bootstrapDesktopReq lato server, eccetto
// CSRPem che viene generato qui.
type BootstrapDesktopReq struct {
	ServerURL     string `json:"server_url"`
	BootstrapURL  string `json:"bootstrap_url"`
	InviteCode    string `json:"invite_code"`
	Email         string `json:"email"`
	Password      string `json:"password"`
	AdminPassword string `json:"admin_password"`
	DeviceName    string `json:"device_name"`
}

type bootstrapResp struct {
	DeviceID     string `json:"device_id"`
	CertPEM      string `json:"cert_pem"`
	CACertPEM    string `json:"ca_cert_pem"`
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
}

// BootstrapDesktop esegue il primo pairing del dispositivo:
//  1. Genera CSR ECDSA P-256 (chiave non lascia mai il client).
//  2. POST a /pairing/bootstrap-desktop sulla porta non-mTLS.
//  3. Persiste cert+chiave+CA+tokens in session.Identity.
//  4. Inizializza l'http.Client mTLS in memoria.
func (a *App) BootstrapDesktop(req BootstrapDesktopReq) (SessionInfo, error) {
	if req.ServerURL == "" || req.InviteCode == "" || req.Email == "" ||
		req.Password == "" || req.AdminPassword == "" {
		return SessionInfo{}, errors.New("missing required fields")
	}
	deviceName := req.DeviceName
	if deviceName == "" {
		host, _ := os.Hostname()
		deviceName = host
		if deviceName == "" {
			deviceName = "desktop"
		}
	}
	gen, err := csr.Generate(deviceName)
	if err != nil {
		return SessionInfo{}, err
	}
	plain := httpclient.NewPlain(bootURLOr(req.BootstrapURL, req.ServerURL))
	body := map[string]string{
		"invite_code":    req.InviteCode,
		"email":          req.Email,
		"password":       req.Password,
		"admin_password": req.AdminPassword,
		"device_name":    deviceName,
		"csr_pem":        gen.CSRPem,
	}
	var resp bootstrapResp
	if err := plain.Do("POST", "/pairing/bootstrap-desktop", body, &resp); err != nil {
		return SessionInfo{}, err
	}
	id := &session.Identity{
		ServerURL:    req.ServerURL,
		Email:        req.Email,
		DeviceID:     resp.DeviceID,
		CertPEM:      resp.CertPEM,
		KeyPEM:       gen.KeyPem,
		CACertPEM:    resp.CACertPEM,
		AccessToken:  resp.AccessToken,
		RefreshToken: resp.RefreshToken,
	}
	if err := session.Save(id); err != nil {
		return SessionInfo{}, fmt.Errorf("persist identity: %w", err)
	}
	cli, err := httpclient.New(id)
	if err != nil {
		return SessionInfo{}, err
	}
	a.mu.Lock()
	a.id = id
	a.client = cli
	a.mu.Unlock()
	// Best-effort: fetch /me per popolare userId/tenantId; ignora errori.
	_ = a.refreshWhoAmI()
	return a.GetSession(), nil
}

// SetupTenantReq è il payload per il bootstrap iniziale del server: crea
// il tenant + il primo utente owner. Da chiamare UNA SOLA VOLTA per server,
// di solito dal wizard "primo avvio" del client desktop.
type SetupTenantReq struct {
	ServerURL     string `json:"server_url"`
	BootstrapURL  string `json:"bootstrap_url"`
	TenantName    string `json:"tenant_name"`
	AdminPassword string `json:"admin_password"`
	OwnerEmail    string `json:"owner_email"`
	OwnerName     string `json:"owner_name"`
	OwnerPassword string `json:"owner_password"`
}

// SetupTenantResp è quello che il backend ci restituisce + lo facciamo
// rimbalzare alla UI così l'utente può copiarsi/salvarsi l'invite code.
type SetupTenantResp struct {
	TenantID   string `json:"tenant_id"`
	UserID     string `json:"user_id"`
	InviteCode string `json:"invite_code"`
}

// SetupTenant chiama /setup/tenant sulla porta non-mTLS del server. NON
// fa pairing del device: l'utente userà subito dopo BootstrapDesktop con
// l'invite_code restituito qui.
func (a *App) SetupTenant(req SetupTenantReq) (SetupTenantResp, error) {
	if req.ServerURL == "" || req.TenantName == "" || req.AdminPassword == "" ||
		req.OwnerEmail == "" || req.OwnerName == "" || req.OwnerPassword == "" {
		return SetupTenantResp{}, errors.New("missing required fields")
	}
	plain := httpclient.NewPlain(bootURLOr(req.BootstrapURL, req.ServerURL))
	body := map[string]string{
		"tenant_name":    req.TenantName,
		"admin_password": req.AdminPassword,
		"owner_email":    req.OwnerEmail,
		"owner_name":     req.OwnerName,
		"owner_password": req.OwnerPassword,
	}
	var resp SetupTenantResp
	if err := plain.Do("POST", "/setup/tenant", body, &resp); err != nil {
		return SetupTenantResp{}, err
	}
	return resp, nil
}

// ReloadTrustReq forza Caddy a ricaricare la trust pool. Va sulla porta
// bootstrap (no mTLS) perché il caso d'uso tipico è "il mio cert non
// passa più la mTLS handshake": la chiamata mTLS qui non funzionerebbe.
type ReloadTrustReq struct {
	BootstrapURL  string `json:"bootstrap_url"`
	TenantID      string `json:"tenant_id"`
	AdminPassword string `json:"admin_password"`
}

// ReloadTrust chiama /setup/reload-trust sulla porta bootstrap. Usa il
// tenant_id corrente (dalla sessione) come default, l'utente può però
// passarne un altro nel raro caso multi-tenant.
func (a *App) ReloadTrust(req ReloadTrustReq) error {
	a.mu.RLock()
	id := a.id
	a.mu.RUnlock()

	tenantID := req.TenantID
	if tenantID == "" && id != nil {
		tenantID = id.TenantID
	}
	if tenantID == "" {
		return errors.New("tenant_id required (no active session)")
	}
	if req.AdminPassword == "" {
		return errors.New("admin_password required")
	}
	bootURL := req.BootstrapURL
	if bootURL == "" && id != nil {
		bootURL = id.ServerURL
	}
	if bootURL == "" {
		return errors.New("bootstrap_url required")
	}
	plain := httpclient.NewPlain(bootURL)
	body := map[string]string{
		"tenant_id":      tenantID,
		"admin_password": req.AdminPassword,
	}
	return plain.Do("POST", "/setup/reload-trust", body, nil)
}

// LoginReq è il payload del login mTLS (presuppone HasSession()).
type LoginReq struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type tokenResp struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
}

// Login re-autentica l'utente con la stessa cert già paired. Richiede una
// sessione preesistente (chiamare BootstrapDesktop prima).
func (a *App) Login(req LoginReq) (SessionInfo, error) {
	a.mu.RLock()
	cli := a.client
	a.mu.RUnlock()
	if cli == nil {
		return SessionInfo{}, errors.New("no session: bootstrap required")
	}
	var resp tokenResp
	if err := cli.Do("POST", "/api/v1/auth/login", req, &resp); err != nil {
		return SessionInfo{}, err
	}
	a.mu.Lock()
	a.id.Email = req.Email
	a.id.AccessToken = resp.AccessToken
	a.id.RefreshToken = resp.RefreshToken
	a.client.SetTokens(resp.AccessToken, resp.RefreshToken)
	idCopy := *a.id
	a.mu.Unlock()
	if err := session.Save(&idCopy); err != nil {
		return SessionInfo{}, err
	}
	_ = a.refreshWhoAmI()
	return a.GetSession(), nil
}

// Logout chiama /auth/logout (best-effort) e azzera i token in memoria, MA
// mantiene cert/chiave su disco — l'utente potrà ri-fare login senza
// re-pairing. Per cancellare tutto usare WipeIdentity.
func (a *App) Logout() error {
	a.mu.RLock()
	cli := a.client
	a.mu.RUnlock()
	if cli != nil {
		_ = cli.Do("POST", "/api/v1/auth/logout", nil, nil)
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.id != nil {
		a.id.AccessToken = ""
		a.id.RefreshToken = ""
		_ = session.Save(a.id)
	}
	if a.client != nil {
		a.client.SetTokens("", "")
	}
	return nil
}

// WipeIdentity rimuove cert, chiave e tokens dal disco e dalla memoria.
// L'utente dovrà ri-fare il pairing dopo questa.
func (a *App) WipeIdentity() error {
	a.mu.Lock()
	a.id = nil
	a.client = nil
	a.mu.Unlock()
	return session.Wipe()
}

// WhoAmI è una chiamata a /api/v1/me, utile per verificare che cert+token
// siano ancora validi.
func (a *App) WhoAmI() (map[string]any, error) {
	a.mu.RLock()
	cli := a.client
	a.mu.RUnlock()
	if cli == nil {
		return nil, errors.New("no session")
	}
	var out map[string]any
	if err := cli.Do("GET", "/api/v1/me", nil, &out); err != nil {
		return nil, err
	}
	return out, nil
}

// ApiRequest è il "passthrough" generico per il frontend: permette di
// chiamare qualsiasi endpoint dell'API mTLS. Il body è stringa JSON
// (o vuoto), la risposta è sempre stringa JSON (o vuota).
//
// Il frontend lo usa via lib/api/client.ts per inviare richieste tipate
// senza dover esporre un binding Go per ogni endpoint.
func (a *App) ApiRequest(method, path, jsonBody string) (string, error) {
	a.mu.RLock()
	cli := a.client
	a.mu.RUnlock()
	if cli == nil {
		return "", errors.New("no session")
	}
	var body any
	if jsonBody != "" {
		body = json.RawMessage(jsonBody)
	}
	var raw json.RawMessage
	if err := cli.Do(method, path, body, &raw); err != nil {
		return "", err
	}
	return string(raw), nil
}

// refreshWhoAmI è un best-effort per aggiornare tenant/user ID dopo
// login/bootstrap. Salva su disco solo se cambia qualcosa.
func (a *App) refreshWhoAmI() error {
	info, err := a.WhoAmI()
	if err != nil {
		return err
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.id == nil {
		return nil
	}
	changed := false
	if v, ok := info["user_id"].(string); ok && v != "" && v != a.id.UserID {
		a.id.UserID = v
		changed = true
	}
	if v, ok := info["tenant_id"].(string); ok && v != "" && v != a.id.TenantID {
		a.id.TenantID = v
		changed = true
	}
	if changed {
		_ = session.Save(a.id)
	}
	return nil
}

// bootURLOr ritorna boot se non vuoto, altrimenti fallback a server.
func bootURLOr(boot, server string) string {
	if boot != "" {
		return boot
	}
	return server
}
