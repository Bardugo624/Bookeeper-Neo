package api

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/bookeeper/bookeeper-neo/server/internal/mw"
)

// Deps is the bundle of dependencies the routers need. main() builds it once.
type Deps struct {
	Authn   *mw.Authn
	Auth    *AuthHandlers
	Devices *DeviceHandlers
	Books   *BookHandlers
	Pairing *PairingHandlers
	Setup   *SetupHandlers
}

// AuthenticatedRouter is mounted by Caddy on the mTLS listener (port 8443).
// Every route requires a valid X-Client-Cert header (set by Caddy from the
// successful mTLS handshake) AND a valid Authorization Bearer JWT.
func AuthenticatedRouter(d Deps) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(30 * time.Second))
	r.Use(d.Authn.Wrap)

	r.Route("/api/v1", func(r chi.Router) {
		r.Get("/me", whoAmI)

		r.Route("/auth", func(r chi.Router) {
			r.Post("/login", d.Auth.Login)
			r.Post("/refresh", d.Auth.Refresh)
			r.Post("/logout", d.Auth.Logout)
		})

		r.Route("/devices", func(r chi.Router) {
			r.Get("/", d.Devices.List)
			r.Post("/pairing-token", d.Devices.CreatePairingToken)
			r.Post("/{id}/revoke", d.Devices.Revoke)
			r.Get("/crl.pem", d.Devices.CRL)
		})

		r.Route("/books", func(r chi.Router) {
			r.Get("/", d.Books.List)
			r.Post("/", d.Books.Create)
		})
	})

	return r
}

// BootstrapRouter is mounted by Caddy on the plain-TLS listener (port 8080).
// No mTLS: only first-time setup, desktop bootstrap (with admin password),
// and mobile pairing redemption (with one-shot token) are accessible here.
func BootstrapRouter(d Deps) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(30 * time.Second))

	r.Get("/healthz", health)

	r.Route("/setup", func(r chi.Router) {
		r.Post("/tenant", d.Setup.CreateTenant)
	})
	r.Route("/pairing", func(r chi.Router) {
		r.Post("/bootstrap-desktop", d.Pairing.BootstrapDesktop)
		r.Post("/redeem", d.Pairing.Redeem)
	})

	return r
}

func health(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{
		"status": "ok",
		"time":   time.Now().UTC().Format(time.RFC3339),
	})
}

func whoAmI(w http.ResponseWriter, r *http.Request) {
	id, _ := mw.FromContext(r.Context())
	writeJSON(w, http.StatusOK, map[string]string{
		"tenant_id": id.TenantID,
		"user_id":   id.UserID,
		"device_id": id.DeviceID,
	})
}
