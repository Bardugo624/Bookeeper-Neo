package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"
	"sync"
	"time"

	"desktop/internal/annas"
	"desktop/internal/csr"
	"desktop/internal/httpclient"
	"desktop/internal/session"
	"desktop/internal/updater"
	"desktop/internal/version"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
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

	// annas e' inizializzato lazy alla prima Lookup; e' un provider
	// thread-safe per Anna's Archive (cache di sessione + rate limit).
	annasOnce sync.Once
	annas     *annas.Provider

	// tokensPersisted indica se l'utente ha scelto "ricordami su
	// questo dispositivo" all'ultimo login. Se true, i tokens
	// vengono scritti su disco (in identity.json) e sopravvivono al
	// riavvio. Se false, vivono solo in memoria: alla chiusura della
	// app l'utente dovrà ri-fare login (il cert resta, niente nuovo
	// pairing).
	tokensPersisted bool
}

// NewApp costruisce l'istanza usata da main.go.
func NewApp() *App {
	return &App{}
}

// startup carica la sessione persistita (se presente) così la UI può
// saltare lo schermo di login.
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	// Auto-check aggiornamenti in background (non blocca l'avvio).
	// Frontend ascolta gli eventi update:* e mostra il banner se appare.
	go a.backgroundUpdateCheck()

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
	a.wireAuthHooks()
}

// wireAuthHooks collega il refresh JWT automatico e l'evento di
// scadenza sessione al Wails event bus. Va chiamato OGNI volta che si
// ricrea a.client (startup / bootstrap / login).
func (a *App) wireAuthHooks() {
	if a.client == nil {
		return
	}
	a.client.OnRefresh = a.refreshTokens
	a.client.OnExpired = a.handleSessionExpired
}

// refreshTokens chiama POST /api/v1/auth/refresh col refresh token
// corrente, persiste i nuovi tokens su disco (se la sessione era stata
// scelta come "ricordami" — cioè i tokens erano già su disco) e li
// ritorna al chiamante.
func (a *App) refreshTokens() (string, string, error) {
	a.mu.RLock()
	cli := a.client
	refresh := ""
	if a.id != nil {
		refresh = a.id.RefreshToken
	}
	a.mu.RUnlock()
	if cli == nil || refresh == "" {
		return "", "", errors.New("no refresh token")
	}
	var resp tokenResp
	if err := cli.Do("POST", "/api/v1/auth/refresh",
		map[string]string{"refresh_token": refresh}, &resp); err != nil {
		return "", "", err
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.id == nil {
		return resp.AccessToken, resp.RefreshToken, nil
	}
	a.id.AccessToken = resp.AccessToken
	a.id.RefreshToken = resp.RefreshToken
	// Persisti solo se i tokens erano già su disco (modalità
	// "ricordami"). Se erano in memoria soltanto, li teniamo lì.
	if a.tokensPersisted {
		_ = session.Save(a.id)
	}
	return resp.AccessToken, resp.RefreshToken, nil
}

// handleSessionExpired è invocato dal http client quando il refresh
// fallisce. Pulisce i tokens (in memoria + su disco) ed emette un
// evento Wails che la UI ascolta per rimandare l'utente alla LoginView.
func (a *App) handleSessionExpired() {
	a.mu.Lock()
	if a.id != nil {
		a.id.AccessToken = ""
		a.id.RefreshToken = ""
		if a.tokensPersisted {
			_ = session.Save(a.id)
		}
	}
	if a.client != nil {
		a.client.SetTokens("", "")
	}
	a.mu.Unlock()
	if a.ctx != nil {
		wailsruntime.EventsEmit(a.ctx, "session:expired")
	}
}

// SessionInfo è il payload restituito a JS per descrivere lo stato di
// sessione (no segreti). HasSession=true SOLO se ci sono tokens validi
// in memoria: il cert paired da solo non basta, l'utente deve aver
// fatto login (o l'identità deve essere persistente "ricordami").
type SessionInfo struct {
	HasSession bool   `json:"has_session"`
	// HasCert indica che il dispositivo è paired (cert+chiave su disco)
	// anche se i tokens sono mancanti/scaduti. Permette alla LoginView
	// di mostrare la modalità "login" invece di "pair".
	HasCert   bool   `json:"has_cert"`
	ServerURL string `json:"server_url"`
	Email     string `json:"email"`
	UserID    string `json:"user_id"`
	TenantID  string `json:"tenant_id"`
	DeviceID  string `json:"device_id"`
}

// AppInfo è la metadata di build esposta alla UI per il pannello "Info".
type AppInfo struct {
	Version   string `json:"version"`    // semver, es. "0.1.0" o "dev"
	BuildDate string `json:"build_date"` // ISO-8601, vuoto in dev
	Channel   string `json:"channel"`    // "stable" / "beta"
}

// GetAppInfo restituisce versione/data/channel dell'app desktop.
// Usato dal tab "Info" e dall'updater.
func (a *App) GetAppInfo() AppInfo {
	return AppInfo{
		Version:   version.Version,
		BuildDate: version.BuildDate,
		Channel:   version.Channel,
	}
}

// GetSession restituisce le info correnti (vuote se nessuna sessione).
func (a *App) GetSession() SessionInfo {
	a.mu.RLock()
	defer a.mu.RUnlock()
	if a.id == nil {
		return SessionInfo{}
	}
	hasTokens := a.id.AccessToken != "" && a.id.RefreshToken != ""
	return SessionInfo{
		HasSession: hasTokens,
		HasCert:    a.id.CertPEM != "" && a.id.KeyPEM != "",
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
	a.tokensPersisted = true // il bootstrap salva sempre tutto
	a.mu.Unlock()
	a.wireAuthHooks()
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

// RecoverInviteReq è il payload per riottenere un invite_code valido a
// partire dall'admin_password del tenant. Pensato per il caso "ho perso
// tutti i dispositivi paired e/o il vecchio invite, ma ho ancora la
// password admin": senza un cert mTLS valido la /tenant/rotate-invite
// e' irraggiungibile, quindi questa va sulla porta bootstrap.
type RecoverInviteReq struct {
	ServerURL     string `json:"server_url"`
	BootstrapURL  string `json:"bootstrap_url"`
	TenantName    string `json:"tenant_name"`
	AdminPassword string `json:"admin_password"`
}

// RecoverInviteResp riflette la risposta del server. tenant_name viene
// rimandato indietro per conferma visiva (case-fix se l'utente ha
// scritto "casa cremisi" e nel DB era "Casa Cremisi").
type RecoverInviteResp struct {
	TenantID   string `json:"tenant_id"`
	TenantName string `json:"tenant_name"`
	InviteCode string `json:"invite_code"`
}

// RecoverInvite chiama /setup/recover-invite. Il server invalida l'invite
// vecchio e ne emette uno nuovo. La UI puo' iniettarlo direttamente nel
// form di pairing senza richiedere altri passaggi.
func (a *App) RecoverInvite(req RecoverInviteReq) (RecoverInviteResp, error) {
	if req.ServerURL == "" || req.TenantName == "" || req.AdminPassword == "" {
		return RecoverInviteResp{}, errors.New("missing required fields")
	}
	plain := httpclient.NewPlain(bootURLOr(req.BootstrapURL, req.ServerURL))
	body := map[string]string{
		"tenant_name":    req.TenantName,
		"admin_password": req.AdminPassword,
	}
	var resp RecoverInviteResp
	if err := plain.Do("POST", "/setup/recover-invite", body, &resp); err != nil {
		return RecoverInviteResp{}, err
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
//
// Persist controlla se i tokens vanno salvati su disco ("ricordami su
// questo dispositivo"). Quando false, i tokens vivono solo in memoria
// per la sessione corrente; alla chiusura dell'app vengono persi e
// l'utente dovrà ri-fare login alla prossima apertura (il cert resta
// comunque, quindi niente nuovo pairing).
type LoginReq struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	Persist  bool   `json:"persist"`
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
	a.tokensPersisted = req.Persist
	idCopy := *a.id
	if !req.Persist {
		// Modalità ephemeral: scrivi su disco UNA versione senza
		// tokens, così se l'utente chiude e riapre l'app i tokens
		// sono persi e dovrà ri-fare login. Il cert (che fa il pairing)
		// resta comunque — il login è quindi un'operazione veloce.
		idCopy.AccessToken = ""
		idCopy.RefreshToken = ""
	}
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

// ============================================================================
// Updater (vedi internal/updater + plan in /memories/session/installer-autoupdate-plan.md)
// ============================================================================

// updateManifestURL e' override-abile via -ldflags se serve cambiare CDN.
//
//	go build -ldflags "-X main.updateManifestURL=https://.../latest.json"
var updateManifestURL = "https://pub-0df1da0d1687437385f2c20390176493.r2.dev/desktop/stable/latest.json"

// UpdateInfo e' il payload Wails-friendly esposto al frontend.
// Tutti i campi sono "snake_case" per coerenza con SessionInfo.
type UpdateInfo struct {
	Available    bool   `json:"available"`
	Current      string `json:"current"`       // versione installata
	Latest       string `json:"latest"`        // versione del manifest
	ReleaseDate  string `json:"release_date"`  // ISO-8601
	NotesMd      string `json:"notes_md"`      // changelog markdown
	SizeBytes    int64  `json:"size_bytes"`
	InstallerURL string `json:"installer_url"` // utile per debug / "scarica manualmente"
}

// pendingInstaller tiene il path del .exe gia' scaricato e verificato,
// pronto per essere lanciato. Pulito alla chiusura dell'app.
var pendingInstaller string

// backgroundUpdateCheck e' lanciato come goroutine in startup. Aspetta
// qualche secondo (così la UI ha modo di renderizzare la prima vista),
// poi interroga il manifest. Se trova una versione piu' recente emette
// "update:available" — il frontend mostra il banner.
//
// Best-effort silenzioso: errori di rete vengono ignorati (no toast).
func (a *App) backgroundUpdateCheck() {
	// Skip in dev: il manifest punta a una versione che non esiste
	// ancora e mostrare un banner "aggiornamento disponibile" durante
	// `wails dev` e' rumore.
	if version.Version == "dev" {
		return
	}
	time.Sleep(3 * time.Second)
	info, err := a.CheckForUpdate()
	if err != nil || !info.Available || a.ctx == nil {
		return
	}
	wailsruntime.EventsEmit(a.ctx, "update:available", info)
}

// CheckForUpdate interroga il manifest pubblico e restituisce le info
// (Available=false se siamo gia' alla versione corrente o piu' nuovi).
func (a *App) CheckForUpdate() (UpdateInfo, error) {
	u := updater.New(updateManifestURL)
	rel, err := u.CheckLatest()
	if err != nil {
		return UpdateInfo{}, err
	}
	return UpdateInfo{
		Available:    updater.IsNewer(version.Version, rel.Version),
		Current:      version.Version,
		Latest:       rel.Version,
		ReleaseDate:  rel.ReleaseDate,
		NotesMd:      rel.NotesMd,
		SizeBytes:    rel.SizeBytes,
		InstallerURL: rel.InstallerURL,
	}, nil
}

// DownloadUpdate scarica l'installer in %TEMP%, verifica SHA-256 e
// emette eventi "update:progress" (downloaded/total) durante il
// trasferimento. Ritorna errore se la verifica fallisce.
func (a *App) DownloadUpdate() error {
	u := updater.New(updateManifestURL)
	rel, err := u.CheckLatest()
	if err != nil {
		return err
	}
	if !updater.IsNewer(version.Version, rel.Version) {
		return errors.New("updater: nessun aggiornamento da scaricare")
	}
	path, err := u.Download(rel, func(downloaded, total int64) {
		if a.ctx == nil {
			return
		}
		wailsruntime.EventsEmit(a.ctx, "update:progress", map[string]int64{
			"downloaded": downloaded,
			"total":      total,
		})
	})
	if err != nil {
		if a.ctx != nil {
			wailsruntime.EventsEmit(a.ctx, "update:error", err.Error())
		}
		return err
	}
	pendingInstaller = path
	if a.ctx != nil {
		wailsruntime.EventsEmit(a.ctx, "update:downloaded", map[string]string{
			"version": rel.Version,
			"path":    path,
		})
	}
	return nil
}

// InstallUpdate lancia l'installer scaricato (modalita' silent+update)
// e termina il processo cosi' Windows puo' sostituire il binario.
func (a *App) InstallUpdate() error {
	if pendingInstaller == "" {
		return errors.New("updater: nessun installer pronto, scaricare prima l'aggiornamento")
	}
	if err := updater.LaunchInstaller(pendingInstaller); err != nil {
		return err
	}
	// updater.LaunchInstaller spawna un cmd.exe che fa:
	//   timeout 2s & installer /S /UPDATE && start <selfExe>
	// Quindi possiamo uscire SUBITO: il `timeout 2` serve proprio ad
	// aspettare che questo processo abbia rilasciato il lock su
	// desktop.exe prima che NSIS provi a sovrascriverlo. Stiamo
	// 300ms per dar tempo all'evento "update:installing" di propagarsi
	// alla UI (cosi' l'utente vede il messaggio di chiusura) prima del
	// hard exit.
	go func() {
		time.Sleep(300 * time.Millisecond)
		os.Exit(0)
	}()
	return nil
}

// ===== Anna's Archive (cover/metadata fallback) ==============================

// AnnasInfo e' la versione esposta a JS dell'annas.Info. Il payload
// resta piatto e serializzabile senza tag custom.
type AnnasInfo struct {
	Title       string   `json:"title"`
	Subtitle    string   `json:"subtitle"`
	Authors     []string `json:"authors"`
	Publisher   string   `json:"publisher"`
	PublishYear int      `json:"publishYear"`
	PageCount   int      `json:"pageCount"`
	Language    string   `json:"language"`
	Description string   `json:"description"`
	ISBN10      string   `json:"isbn10"`
	ISBN13      string   `json:"isbn13"`
	CoverURL    string   `json:"coverUrl"`
	SourceURL   string   `json:"sourceUrl"`
}

// LookupIsbnAnnas e' il fallback finale del frontend dopo Google Books
// e Open Library. Restituisce un AnnasInfo (campi vuoti se non noti)
// oppure una struct azzerata + error == nil per indicare "non trovato".
//
// Su errore transiente (rete / Cloudflare challenge) l'errore viene
// propagato cosi' il frontend NON mette in negative cache.
func (a *App) LookupIsbnAnnas(rawISBN string) (AnnasInfo, error) {
	a.annasOnce.Do(func() {
		ua := "Bookeeper/" + version.Version + " (+https://github.com/Bardugo624/Bookeeper-Neo)"
		a.annas = annas.New(ua)
	})

	ctx := a.ctx
	if ctx == nil {
		ctx = context.Background()
	}
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()

	info, err := a.annas.Lookup(ctx, rawISBN)
	if err != nil {
		return AnnasInfo{}, err
	}
	if info == nil {
		return AnnasInfo{}, nil // not found (negative)
	}
	return AnnasInfo{
		Title:       info.Title,
		Subtitle:    info.Subtitle,
		Authors:     info.Authors,
		Publisher:   info.Publisher,
		PublishYear: info.PublishYear,
		PageCount:   info.PageCount,
		Language:    info.Language,
		Description: info.Description,
		ISBN10:      info.ISBN10,
		ISBN13:      info.ISBN13,
		CoverURL:    info.CoverURL,
		SourceURL:   info.SourceURL,
	}, nil
}

// ===== Unified metadata lookup ===============================================
//
// MetadataInfo e' lo shape del nuovo endpoint server-side
// `/api/v1/lookup/metadata/{isbn}` (vedi server/internal/lookup).
// Sostituisce nel tempo i lookup paralleli che desktop e mobile facevano
// client-side verso GoogleBooks / OpenLibrary / AnnasArchive.
//
// I tag JSON sono camelCase per coerenza col server.
type MetadataInfo struct {
	Title           string   `json:"title"`
	Subtitle        string   `json:"subtitle"`
	Authors         []string `json:"authors"`
	Publisher       string   `json:"publisher"`
	PublishYear     int      `json:"publishYear"`
	PageCount       int      `json:"pageCount"`
	Language        string   `json:"language"`
	Description     string   `json:"description"`
	Genre           string   `json:"genre"`
	Format          string   `json:"format"`
	ISBN10          string   `json:"isbn10"`
	ISBN13          string   `json:"isbn13"`
	CoverURL        string   `json:"coverUrl"`
	CoverCandidates []string `json:"coverCandidates"`
	SourceURL       string   `json:"sourceUrl"`
	Sources         []string `json:"sources"`
}

// LookupMetadata e' il punto unico per ottenere metadata + cover URLs.
// Politica:
//  1. Se la sessione mTLS e' attiva, chiama
//     `GET /api/v1/lookup/metadata/{isbn}` sul server (che orchestra
//     GoogleBooks → AnnasArchive → OpenLibrary, con cache 30g).
//  2. Se il server e' irraggiungibile (utente offline o non ancora
//     paired) ricade sul provider locale Anna's Archive — meno ricco
//     ma sufficiente per inserire il libro a mano senza connessione.
//
// Sempre struct azzerata + nil per "non trovato"; error solo per
// fallimenti transienti (frontend NON deve metterli in negative cache).
func (a *App) LookupMetadata(rawISBN string) (MetadataInfo, error) {
	// Path 1: server unificato (preferito).
	a.mu.RLock()
	cli := a.client
	a.mu.RUnlock()
	if cli != nil {
		var resp MetadataInfo
		err := cli.Do("GET", "/api/v1/lookup/metadata/"+rawISBN, nil, &resp)
		if err == nil {
			return resp, nil
		}
		// 404 logico: il server ha detto "no record". Distinguiamolo
		// dagli errori transienti per non innescare il fallback AA
		// (che probabilmente direbbe la stessa cosa).
		if isHTTPNotFound(err) {
			return MetadataInfo{}, nil
		}
		// Errori non-404 (rete, 5xx, mTLS broken): proviamo il locale.
	}

	// Path 2: fallback locale Anna's Archive. Mappa il vecchio
	// AnnasInfo sul nuovo MetadataInfo cosi' il frontend usa
	// sempre lo stesso shape.
	aa, err := a.LookupIsbnAnnas(rawISBN)
	if err != nil {
		return MetadataInfo{}, err
	}
	if aa.Title == "" && aa.CoverURL == "" {
		return MetadataInfo{}, nil
	}
	out := MetadataInfo{
		Title:       aa.Title,
		Subtitle:    aa.Subtitle,
		Authors:     aa.Authors,
		Publisher:   aa.Publisher,
		PublishYear: aa.PublishYear,
		PageCount:   aa.PageCount,
		Language:    aa.Language,
		Description: aa.Description,
		ISBN10:      aa.ISBN10,
		ISBN13:      aa.ISBN13,
		CoverURL:    aa.CoverURL,
		SourceURL:   aa.SourceURL,
		Sources:     []string{"annas-archive"},
	}
	if aa.CoverURL != "" {
		out.CoverCandidates = []string{aa.CoverURL}
	}
	return out, nil
}

// isHTTPNotFound e' una euristica leggera: il client httpclient.Do
// formatta gli errori HTTP includendo "404" nel messaggio. Sufficiente
// per discriminare il "definitivo no" dal transiente.
func isHTTPNotFound(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	return strings.Contains(msg, "404") ||
		strings.Contains(strings.ToLower(msg), "non trovato") ||
		strings.Contains(strings.ToLower(msg), "not found")
}

