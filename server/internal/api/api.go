// Package api wires HTTP handlers together. The Router exposes two distinct
// surfaces:
//
//   - Authenticated() — requires mTLS client cert + JWT; mounted at /api/v1
//     behind the mTLS-enforcing Caddy frontend (port 8443).
//
//   - Bootstrap() — pairing/bootstrap endpoints used before a device has a
//     cert. Mounted by Caddy on the plain-TLS port 8080. These endpoints are
//     rate-limited and consume one-shot tokens or the tenant admin password.
package api

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
)

// writeJSON serialises v as JSON with the given status code.
func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// readJSON decodes the request body into v, returning a 400 on failure.
func readJSON(w http.ResponseWriter, r *http.Request, v interface{}) bool {
	if err := json.NewDecoder(r.Body).Decode(v); err != nil {
		writeJSON(w, http.StatusBadRequest, errResp{Error: "invalid json: " + err.Error()})
		return false
	}
	return true
}

type errResp struct {
	Error string `json:"error"`
}

func writeErr(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, errResp{Error: msg})
}

// chiURLParam returns a path parameter or empty string.
func chiURLParam(r *http.Request, name string) string {
	return chi.URLParam(r, name)
}
