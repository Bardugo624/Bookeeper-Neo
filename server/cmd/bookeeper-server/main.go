// bookeeper-server is the central multi-tenant API for Bookeeper Neo.
//
// It runs two HTTP listeners, both designed to sit behind a Caddy reverse
// proxy that terminates TLS / mTLS:
//
//   - BindAuth (default :7842) — authenticated surface. Caddy enforces mTLS
//     on its public :8443 and forwards the verified client cert via the
//     X-Client-Cert header.
//   - BindBoot (default :7843) — unauthenticated bootstrap surface. Caddy
//     exposes it on :8080 (plain TLS) for first-time setup, desktop
//     bootstrap, and mobile pairing redemption.
//
// On the local network the service is advertised via mDNS as
// _bookeeper._tcp.local with a `fp=<sha256>` TXT record so clients can pin
// trust to the server's first tenant CA when they discover it.
package main

import (
	"context"
	"crypto/sha256"
	"crypto/x509"
	"database/sql"
	"encoding/hex"
	"encoding/pem"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/bookeeper/bookeeper-neo/server/internal/api"
	"github.com/bookeeper/bookeeper-neo/server/internal/auth"
	"github.com/bookeeper/bookeeper-neo/server/internal/ca"
	"github.com/bookeeper/bookeeper-neo/server/internal/config"
	"github.com/bookeeper/bookeeper-neo/server/internal/db"
	"github.com/bookeeper/bookeeper-neo/server/internal/mdns"
	"github.com/bookeeper/bookeeper-neo/server/internal/mw"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(logger)

	cfg, err := config.Load()
	if err != nil {
		slog.Error("config load failed", "err", err)
		os.Exit(1)
	}

	database, err := db.Open(cfg.DataDir)
	if err != nil {
		slog.Error("db open failed", "err", err)
		os.Exit(1)
	}
	defer database.Close()

	if err := db.Migrate(database); err != nil {
		slog.Error("db migrate failed", "err", err)
		os.Exit(1)
	}

	issuer := auth.NewIssuer(cfg.JWTSecret, cfg.JWTAccessTTL, cfg.JWTRefreshTTL)
	caStore := ca.NewStore()
	auditMW := &mw.Audit{DB: database}
	authnMW := &mw.Authn{DB: database, Issuer: issuer}

	deps := api.Deps{
		Authn: authnMW,
		Auth: &api.AuthHandlers{
			DB: database, Issuer: issuer, Audit: auditMW,
		},
		Devices: &api.DeviceHandlers{
			DB: database, Audit: auditMW, CAStore: caStore,
			PairingTTL: cfg.PairingTokenTTL,
			ServerHost: cfg.ServerHost,
			ServerPort: cfg.ServerPort,
		},
		Books: &api.BookHandlers{DB: database, Audit: auditMW},
		Pairing: &api.PairingHandlers{
			DB: database, Audit: auditMW, Issuer: issuer,
			CAStore: caStore, PairingTTL: cfg.PairingTokenTTL,
		},
		Setup: &api.SetupHandlers{DB: database, Audit: auditMW},
	}

	authSrv := &http.Server{
		Addr:              cfg.BindAuth,
		Handler:           api.AuthenticatedRouter(deps),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       2 * time.Minute,
	}
	bootSrv := &http.Server{
		Addr:              cfg.BindBoot,
		Handler:           api.BootstrapRouter(deps),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       2 * time.Minute,
	}

	go func() {
		slog.Info("authenticated surface listening", "addr", cfg.BindAuth)
		if err := authSrv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			slog.Error("auth server failed", "err", err)
			os.Exit(1)
		}
	}()
	go func() {
		slog.Info("bootstrap surface listening", "addr", cfg.BindBoot)
		if err := bootSrv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			slog.Error("bootstrap server failed", "err", err)
			os.Exit(1)
		}
	}()

	// mDNS: advertise the first tenant's CA fingerprint if any tenant exists.
	// In multi-tenant deployments clients discover the server, then look up
	// their tenant-specific CA via the bootstrap surface.
	fp := firstTenantFingerprint(database)
	mdnsSrv, mdnsErr := mdns.Publish(cfg.ServiceName, cfg.ServerPort, fp)
	if mdnsErr != nil {
		slog.Warn("mdns publish failed (continuing)", "err", mdnsErr)
	}

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop
	slog.Info("shutdown requested")

	if mdnsSrv != nil {
		mdnsSrv.Shutdown()
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = authSrv.Shutdown(ctx)
	_ = bootSrv.Shutdown(ctx)
	slog.Info("bye")
}

// firstTenantFingerprint returns the sha256 hex fingerprint of the oldest
// tenant's CA cert, or "" if no tenant exists yet (fresh install).
func firstTenantFingerprint(database *sql.DB) string {
	var pemStr string
	err := database.QueryRow(`SELECT ca_cert_pem FROM tenants ORDER BY created_at LIMIT 1`).Scan(&pemStr)
	if err != nil {
		return ""
	}
	block, _ := pem.Decode([]byte(pemStr))
	if block == nil {
		return ""
	}
	c, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		return ""
	}
	sum := sha256.Sum256(c.Raw)
	return hex.EncodeToString(sum[:])
}
