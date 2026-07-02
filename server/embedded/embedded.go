// Package embedded runs the full Bookeeper server in-process, bound to
// 127.0.0.1, for the desktop "local library" (self-hosting) mode.
//
// Differences from the standalone deployment:
//   - No Caddy, no TLS: both surfaces listen plain-HTTP on loopback only.
//   - No mTLS handshake: the desktop client sets the X-Client-Cert header
//     itself with its own paired leaf cert. The Authn middleware validates
//     it against the devices table exactly as in the proxied deployment.
//     Threat model: anything running as the same OS user could also read
//     the SQLite file directly, so loopback binding is the boundary here.
//   - No trust pool / mDNS: nothing external needs to trust the tenant CA.
package embedded

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net"
	"net/http"
	"path/filepath"
	"time"

	"github.com/bookeeper/bookeeper-neo/server/internal/api"
	"github.com/bookeeper/bookeeper-neo/server/internal/auth"
	"github.com/bookeeper/bookeeper-neo/server/internal/ca"
	"github.com/bookeeper/bookeeper-neo/server/internal/config"
	"github.com/bookeeper/bookeeper-neo/server/internal/db"
	"github.com/bookeeper/bookeeper-neo/server/internal/mw"
)

// ponytail: fixed loopback ports, chosen high/uncommon. Switch to :0 +
// port persistence only if real-world conflicts get reported.
const (
	authAddr = "127.0.0.1:38471"
	bootAddr = "127.0.0.1:38472"

	// AuthURL and BootURL are the base URLs desktop clients use to reach
	// the embedded server.
	AuthURL = "http://" + authAddr
	BootURL = "http://" + bootAddr
)

// Server is a running embedded instance. Close it on app shutdown.
type Server struct {
	DB      *sql.DB
	authSrv *http.Server
	bootSrv *http.Server
}

// Start opens (or creates) the local data directory, migrates the DB and
// starts both HTTP surfaces on loopback. It returns once the listeners are
// bound, so callers can immediately talk to BootURL/AuthURL.
func Start(dataDir string) (*Server, error) {
	database, err := db.Open(dataDir)
	if err != nil {
		return nil, fmt.Errorf("embedded: db open: %w", err)
	}
	if err := db.Migrate(database); err != nil {
		database.Close()
		return nil, fmt.Errorf("embedded: db migrate: %w", err)
	}

	jwtSecret, err := config.LoadOrGenSecret(filepath.Join(dataDir, "jwt.key"))
	if err != nil {
		database.Close()
		return nil, fmt.Errorf("embedded: jwt secret: %w", err)
	}
	serverKey, err := ca.LoadOrCreateServerKey(filepath.Join(dataDir, "ca-server.key"))
	if err != nil {
		database.Close()
		return nil, fmt.Errorf("embedded: server key: %w", err)
	}

	issuer := auth.NewIssuer(jwtSecret, 15*time.Minute, 30*24*time.Hour)
	caStore := ca.NewStore()
	if _, err := ca.AutoUnlockAll(database, caStore, serverKey); err != nil {
		database.Close()
		return nil, fmt.Errorf("embedded: ca auto-unlock: %w", err)
	}

	auditMW := &mw.Audit{DB: database}
	deps := api.Deps{
		Authn:       &mw.Authn{DB: database, Issuer: issuer},
		MobileAuthn: &mw.MobileAuthn{DB: database, Issuer: issuer},
		Auth:        &api.AuthHandlers{DB: database, Issuer: issuer, Audit: auditMW},
		Devices: &api.DeviceHandlers{
			DB: database, Audit: auditMW, CAStore: caStore,
			PairingTTL:    10 * time.Minute,
			ServerHost:    "127.0.0.1",
			ServerPort:    38472,
			PublicBaseURL: BootURL,
			ServerKey:     serverKey,
		},
		Books:    &api.BookHandlers{DB: database, Audit: auditMW},
		Shelves:  &api.ShelfHandlers{DB: database, Audit: auditMW},
		Wishlist: &api.WishlistHandlers{DB: database, Audit: auditMW},
		Loans:    &api.LoanHandlers{DB: database, Audit: auditMW},
		Stats:    &api.StatHandlers{DB: database},
		Pairing: &api.PairingHandlers{
			DB: database, Audit: auditMW, Issuer: issuer,
			CAStore: caStore, PairingTTL: 10 * time.Minute,
			ServerKey: serverKey,
		},
		// TrustPool nil: no Caddy to feed. Setup handlers skip it.
		Setup:  &api.SetupHandlers{DB: database, Audit: auditMW, CAStore: caStore, ServerKey: serverKey},
		Tenant: &api.TenantHandlers{DB: database},
		Lookup: api.NewLookupHandlers("Bookeeper-embedded/1.0 (+https://github.com/Bardugo624/Bookeeper-Neo)"),
	}

	authLn, err := net.Listen("tcp", authAddr)
	if err != nil {
		database.Close()
		return nil, fmt.Errorf("embedded: bind %s (porta occupata?): %w", authAddr, err)
	}
	bootLn, err := net.Listen("tcp", bootAddr)
	if err != nil {
		authLn.Close()
		database.Close()
		return nil, fmt.Errorf("embedded: bind %s (porta occupata?): %w", bootAddr, err)
	}

	s := &Server{
		DB: database,
		authSrv: &http.Server{
			Handler:           api.AuthenticatedRouter(deps),
			ReadHeaderTimeout: 10 * time.Second,
		},
		bootSrv: &http.Server{
			Handler:           api.BootstrapRouter(deps),
			ReadHeaderTimeout: 10 * time.Second,
		},
	}
	go func() {
		if err := s.authSrv.Serve(authLn); err != nil && !errors.Is(err, http.ErrServerClosed) {
			fmt.Println("embedded auth server:", err)
		}
	}()
	go func() {
		if err := s.bootSrv.Serve(bootLn); err != nil && !errors.Is(err, http.ErrServerClosed) {
			fmt.Println("embedded boot server:", err)
		}
	}()
	return s, nil
}

// Close shuts down both listeners and the database.
func (s *Server) Close() {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = s.authSrv.Shutdown(ctx)
	_ = s.bootSrv.Shutdown(ctx)
	_ = s.DB.Close()
}
