// Package httpclient costruisce l'http.Client mTLS che parla al server
// Bookeeper. Carica cert+chiave dal session.Identity, fida solo della CA
// del tenant, e aggiunge il bearer JWT su ogni richiesta.
package httpclient

import (
	"bytes"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"desktop/internal/session"
)

// Client wrappa http.Client + base URL + reference all'identità per refresh.
type Client struct {
	id      *session.Identity
	httpCli *http.Client
}

// New costruisce un client mTLS dal session.Identity dato. Il cliente è
// stateless rispetto al refresh dei token: il chiamante è responsabile di
// chiamare SetTokens dopo un refresh JWT.
func New(id *session.Identity) (*Client, error) {
	if id == nil {
		return nil, errors.New("nil identity")
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
	url := strings.TrimRight(c.id.ServerURL, "/") + path
	var rdr io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("marshal body: %w", err)
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
	if c.id.AccessToken != "" {
		req.Header.Set("Authorization", "Bearer "+c.id.AccessToken)
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
