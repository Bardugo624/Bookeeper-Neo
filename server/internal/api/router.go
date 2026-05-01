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
	Books    *BookHandlers
	Shelves  *ShelfHandlers
	Wishlist *WishlistHandlers
	Loans    *LoanHandlers
	Stats    *StatHandlers
	Pairing  *PairingHandlers
	Setup   *SetupHandlers
	Tenant  *TenantHandlers
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
			r.Get("/{id}", d.Books.Get)
			r.Patch("/{id}", d.Books.Update)
			r.Delete("/{id}", d.Books.Delete)
			r.Patch("/{id}/shelf", d.Shelves.Assign)
		})

		r.Route("/shelves", func(r chi.Router) {
			r.Get("/", d.Shelves.List)
			r.Post("/", d.Shelves.Create)
			r.Get("/{id}", d.Shelves.Get)
			r.Patch("/{id}", d.Shelves.Update)
			r.Delete("/{id}", d.Shelves.Delete)
			r.Get("/{id}/books", d.Shelves.ListBooks)
		})

		r.Route("/wishlist", func(r chi.Router) {
			r.Get("/", d.Wishlist.List)
			r.Post("/", d.Wishlist.Create)
			r.Patch("/{id}", d.Wishlist.Update)
			r.Delete("/{id}", d.Wishlist.Delete)
			r.Post("/{id}/convert", d.Wishlist.Convert)
		})

		r.Route("/loans", func(r chi.Router) {
			r.Get("/", d.Loans.List)
			r.Post("/", d.Loans.Create)
			r.Patch("/{id}", d.Loans.Update)
			r.Delete("/{id}", d.Loans.Delete)
			r.Post("/{id}/return", d.Loans.Return)
			r.Post("/{id}/reopen", d.Loans.Reopen)
		})

		r.Route("/tenant", func(r chi.Router) {
			r.Get("/", d.Tenant.Get)
			r.Post("/rotate-invite", d.Tenant.RotateInvite)
		})

		r.Get("/stats", d.Stats.Get)
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
		r.Post("/reload-trust", d.Setup.ReloadTrust)
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
