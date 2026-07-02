// Package httpclient costruisce l'http.Client mTLS che parla al server
// Bookeeper. Carica cert+chiave dal session.Identity, fida solo della CA
// del tenant, e aggiunge il bearer JWT su ogni richiesta.
package httpclient

import (
	"bytes"
	"crypto/tls"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"desktop/internal/session"
)

// Client wrappa http.Client + base URL + reference all'identita per refresh.
type Client struct {
	id      *session.Identity
	httpCli *http.Client

	// certHeader, se non vuoto, viene inviato come X-Client-Cert su ogni
	// richiesta (modalità "libreria locale": niente Caddy che termina la
	// mTLS, il client presenta da sé il proprio leaf cert in base64-DER;
	// il server embedded ascolta solo su 127.0.0.1).
	certHeader string

	// OnRefresh, se non nil, viene invocato quando una chiamata
	// autenticata riceve 401. Deve eseguire il flusso di refresh JWT
	// (POST /api/v1/auth/refresh) usando il refresh token corrente,
	// persistere i nuovi tokens su disco e ritornarli. Se ritorna
	// errore, la chiamata originale fallisce con APIError 401 e viene
	// invocato OnExpired (se settato).
	OnRefresh func() (access string, refresh string, err error)

	// OnExpired viene invocato quando il refresh fallisce in modo
	// terminale (refresh token scaduto/non valido). Tipicamente la app
	// ne approfitta per emettere un evento Wails alla UI cosi' l'utente
	// venga rimandato alla LoginView con un banner.
	OnExpired func()

	// refreshing serializza il refresh: se due chiamate concorrenti
	// vedono 401, solo una esegue il refresh e l'altra aspetta.
	refreshing sync.Mutex
}

// New costruisce un client mTLS dal session.Identity dato. Il cliente è
// stateless rispetto al refresh dei token: il chiamante è responsabile di
// chiamare SetTokens dopo un refresh JWT.
func New(id *session.Identity) (*Client, error) {
	if id == nil {
		return nil, errors.New("nil identity")
	}
	if id.Local {
		// Modalità locale: server embedded su loopback, HTTP plain. Il leaf
		// cert viaggia in X-Client-Cert (stesso formato base64-DER che Caddy
		// inoltra nel deploy remoto), così il middleware Authn è identico.
		block, _ := pem.Decode([]byte(id.CertPEM))
		if block == nil {
			return nil, errors.New("invalid local client cert")
		}
		return &Client{
			id:         id,
			httpCli:    &http.Client{Timeout: 30 * time.Second},
			certHeader: base64.StdEncoding.EncodeToString(block.Bytes),
		}, nil
	}
	cert, err := tls.X509KeyPair([]byte(id.CertPEM), []byte(id.KeyPEM))
	if err != nil {
		return nil, fmt.Errorf("load client keypair: %w", err)
	}
	// Parti dalle root di sistema (per il cert pubblico del server, es.
	// Let's Encrypt terminato dal reverse proxy) e aggiungi la CA interna
	// del tenant — usata solo per validare il cert *server* in deploy non
	// pubblici / self-signed. Il cert client mTLS è separato (Certificates).
	pool, err := x509.SystemCertPool()
	if err != nil || pool == nil {
		pool = x509.NewCertPool()
	}
	if !pool.AppendCertsFromPEM([]byte(id.CACertPEM)) {
		return nil, errors.New("invalid CA cert")
	}
	tr := &http.Transport{
		TLSClientConfig: &tls.Config{
			Certificates: []tls.Certificate{cert},
			RootCAs:      pool,
			MinVersion:   tls.VersionTLS12,
		},
		ForceAttemptHTTP2:   true,
		IdleConnTimeout:     90 * time.Second,
		TLSHandshakeTimeout: 10 * time.Second,
	}
	return &Client{
		id:      id,
		httpCli: &http.Client{Transport: tr, Timeout: 30 * time.Second},
	}, nil
}

// SetTokens aggiorna access/refresh dopo un refresh riuscito.
func (c *Client) SetTokens(access, refresh string) {
	c.id.AccessToken = access
	c.id.RefreshToken = refresh
}

// APIError rappresenta un errore HTTP non-2xx con corpo decodificato.
type APIError struct {
	Status int
	Body   string
}

func (e *APIError) Error() string {
	return fmt.Sprintf("api error %d: %s", e.Status, e.Body)
}

// Do esegue una richiesta JSON sul path dato (relativo all'host del server)
// e decodifica la risposta in `out` (può essere nil per ignorare il body).
//
// Aggiunge automaticamente:
//   - Authorization: Bearer <access_token>
//   - Content-Type: application/json
//   - Accept: application/json
func (c *Client) Do(method, path string, body any, out any) error {
	return c.do(method, path, body, out, false)
}

func (c *Client) do(method, path string, body any, out any, retried bool) error {
	url := strings.TrimRight(c.id.ServerURL, "/") + path
	// Serializziamo il body una volta sola: se il primo tentativo
	// torna 401 e dobbiamo ripetere dopo un refresh, riusiamo gli
	// stessi bytes (non possiamo re-leggere un io.Reader esaurito).
	var bodyBytes []byte
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("marshal body: %w", err)
		}
		bodyBytes = b
	}
	var rdr io.Reader
	if bodyBytes != nil {
		rdr = bytes.NewReader(bodyBytes)
	}
	req, err := http.NewRequest(method, url, rdr)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	if c.certHeader != "" {
		req.Header.Set("X-Client-Cert", c.certHeader)
	}
	if bodyBytes != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if c.id.AccessToken != "" {
		req.Header.Set("Authorization", "Bearer "+c.id.AccessToken)
	}
	resp, err := c.httpCli.Do(req)
	if err != nil {
		return fmt.Errorf("http: %w", err)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)

	// 401 su una chiamata autenticata e non ancora ritentata: prova
	// un refresh JWT (mTLS, niente Bearer richiesto) e ripeti UNA volta.
	if resp.StatusCode == http.StatusUnauthorized && !retried &&
		c.OnRefresh != nil && path != "/api/v1/auth/refresh" {
		if c.tryRefresh() {
			return c.do(method, path, body, out, true)
		}
		// Refresh fallito: notifica la UI (la app emettera' un evento
		// session:expired su Wails). Restituiamo il 401 originale.
		if c.OnExpired != nil {
			c.OnExpired()
		}
	}

	if resp.StatusCode >= 400 {
		return &APIError{Status: resp.StatusCode, Body: string(respBody)}
	}
	if out != nil && len(respBody) > 0 {
		if err := json.Unmarshal(respBody, out); err != nil {
			return fmt.Errorf("decode response: %w", err)
		}
	}
	return nil
}

// tryRefresh esegue al massimo un refresh per volta (mutex). Le chiamate
// concorrenti che trovano gia' un refresh in corso aspettano e poi
// procedono con i tokens aggiornati.
func (c *Client) tryRefresh() bool {
	c.refreshing.Lock()
	defer c.refreshing.Unlock()
	if c.OnRefresh == nil {
		return false
	}
	access, refresh, err := c.OnRefresh()
	if err != nil {
		return false
	}
	c.id.AccessToken = access
	c.id.RefreshToken = refresh
	return true
}

// Plain è un client HTTP senza mTLS (usato per il bootstrap iniziale, che
// passa per la porta non-mTLS del server). Richiede solo l'URL base.
type Plain struct {
	baseURL string
	httpCli *http.Client
}

// NewPlain costruisce un client per il bootstrap (no client cert, no auth).
func NewPlain(baseURL string) *Plain {
	return &Plain{
		baseURL: baseURL,
		httpCli: &http.Client{Timeout: 30 * time.Second},
	}
}

// Do esegue una richiesta JSON senza mTLS.
func (c *Plain) Do(method, path string, body any, out any) error {
	url := strings.TrimRight(c.baseURL, "/") + path
	var rdr io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return err
		}
		rdr = bytes.NewReader(b)
	}
	req, err := http.NewRequest(method, url, rdr)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := c.httpCli.Do(req)
	if err != nil {
		return fmt.Errorf("http: %w", err)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return &APIError{Status: resp.StatusCode, Body: string(respBody)}
	}
	if out != nil && len(respBody) > 0 {
		if err := json.Unmarshal(respBody, out); err != nil {
			return fmt.Errorf("decode response: %w", err)
		}
	}
	return nil
}
