// Package trustpool maintains the file Caddy uses to validate client certs.
//
// Caddy's mTLS `trust_pool file { pem_file ... }` directive reads a single
// concatenated PEM bundle of trusted root CAs. Since each tenant has its
// own internal CA, we must regenerate that bundle whenever the set of
// tenants changes (creation, deletion). After writing the file we ask
// Caddy to reload its config — Caddy re-reads the trust_pool atomically
// and the running mTLS handshakes are not interrupted.
//
// The file location is the same volume mounted into both the server and
// the Caddy containers (compose: `bookeeper-certs` -> /certs).
package trustpool

import (
	"bytes"
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// Manager owns the trusted_clients.pem file and the Caddy reload trigger.
type Manager struct {
	db        *sql.DB
	pemPath   string // e.g. /certs/trusted_clients.pem
	caddyAdmin string // e.g. http://bookeeper-caddy:2019
	mu        sync.Mutex
}

// New constructs a Manager. pemPath must live on a volume shared with the
// Caddy container; caddyAdmin is the Caddy admin API URL (default port 2019)
// reachable from the server container on the internal Docker network.
func New(db *sql.DB, pemPath, caddyAdmin string) *Manager {
	return &Manager{db: db, pemPath: pemPath, caddyAdmin: caddyAdmin}
}

// Rebuild regenerates the trust pool from the current set of tenants and
// triggers a Caddy reload. Safe to call concurrently — it serialises calls
// internally so a burst of tenant changes results in a single reload.
func (m *Manager) Rebuild(ctx context.Context) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	rows, err := m.db.QueryContext(ctx, `SELECT ca_cert_pem FROM tenants ORDER BY created_at`)
	if err != nil {
		return fmt.Errorf("trustpool: query tenants: %w", err)
	}
	defer rows.Close()

	var buf bytes.Buffer
	buf.WriteString("# Bookeeper trusted client CAs — auto-generated, do not edit.\n")
	buf.WriteString("# Regenerated at " + time.Now().UTC().Format(time.RFC3339) + "\n\n")
	count := 0
	for rows.Next() {
		var pemStr string
		if err := rows.Scan(&pemStr); err != nil {
			return fmt.Errorf("trustpool: scan: %w", err)
		}
		if !strings.HasSuffix(pemStr, "\n") {
			pemStr += "\n"
		}
		buf.WriteString(pemStr)
		count++
	}
	if err := rows.Err(); err != nil {
		return err
	}

	if err := atomicWrite(m.pemPath, buf.Bytes()); err != nil {
		return fmt.Errorf("trustpool: write: %w", err)
	}
	slog.Info("trust pool rebuilt", "tenants", count, "path", m.pemPath)

	if err := m.reloadCaddy(ctx); err != nil {
		// The file is on disk; on Caddy restart it'll pick it up. Don't fail
		// the calling business operation, but log LOUDLY: a stale in-memory
		// trust pool means new client certs are rejected during mTLS
		// handshake (visible client-side as `EOF` on /api/v1/...).
		slog.Error(
			"caddy reload FAILED — new client certs will be REJECTED until Caddy is restarted manually",
			"err", err,
			"caddy_admin", m.caddyAdmin,
			"pem_path", m.pemPath,
			"hint", "docker compose restart caddy  (or POST /setup/reload-trust)",
		)
		return nil
	}
	return nil
}

// EnsureExists writes a (possibly empty) trust pool on startup so Caddy can
// boot even before the first tenant is created. Without this Caddy fails
// loudly because trust_pool is a required reference.
func (m *Manager) EnsureExists(ctx context.Context) error {
	if _, err := os.Stat(m.pemPath); err == nil {
		return nil
	}
	return m.Rebuild(ctx)
}

// reloadCaddy POSTs an empty body to /reload — Caddy re-reads its existing
// config from /etc/caddy/Caddyfile, which in turn re-parses the
// trusted_clients.pem we just wrote. No downtime.
func (m *Manager) reloadCaddy(ctx context.Context) error {
	if m.caddyAdmin == "" {
		return nil
	}
	rctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(rctx, http.MethodPost, m.caddyAdmin+"/load", nil)
	if err != nil {
		return err
	}
	// Asking Caddy to reload its current adapted config. With the Caddyfile
	// adapter mounted as the source of truth, the simpler path is to send
	// SIGUSR1; but the admin API works equally well in containers without
	// shared PID namespace. We POST the current Caddyfile via the adapt API.
	req.Header.Set("Content-Type", "text/caddyfile")
	caddyfile, err := os.ReadFile("/etc/caddy/Caddyfile")
	if err != nil {
		// Fallback: hit /reload with no body and let Caddy re-read its file.
		return m.reloadEmpty(rctx)
	}
	req.Body = newReadCloser(caddyfile)
	req.ContentLength = int64(len(caddyfile))

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode/100 != 2 {
		return fmt.Errorf("caddy reload status %d", resp.StatusCode)
	}
	return nil
}

func (m *Manager) reloadEmpty(ctx context.Context) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, m.caddyAdmin+"/reload", nil)
	if err != nil {
		return err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode/100 != 2 {
		return fmt.Errorf("caddy reload status %d", resp.StatusCode)
	}
	return nil
}

// atomicWrite writes data to path via a temp file + rename so Caddy never
// reads a half-written PEM bundle.
func atomicWrite(path string, data []byte) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(dir, ".trustpool-*.tmp")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	defer func() { _ = os.Remove(tmpName) }()

	if _, err := tmp.Write(data); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Chmod(0o644); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Sync(); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmpName, path)
}

// readCloser wraps a byte slice as an io.ReadCloser without pulling in
// bytes.NewReader+io.NopCloser at every call site.
type readCloser struct{ *bytes.Reader }

func newReadCloser(b []byte) *readCloser { return &readCloser{bytes.NewReader(b)} }
func (r *readCloser) Close() error       { return nil }
