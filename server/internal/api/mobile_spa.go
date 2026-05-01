package api

import (
	"embed"
	"io/fs"
	"net/http"
	"path"
	"strings"
	"time"
)

// MobileSPA serves the Bookeeper mobile PWA bundled at build time from
// `clients/mobile-web/dist`. The Dockerfile multi-stage copies the built
// assets into `server/internal/api/dist/` before `go build`, so this embed
// captures them. A placeholder `dist/index.html` lives in the repo only to
// make `go build` succeed in environments that haven't run the Node build.
//
// Routing rules (mounted under /m/):
//   - GET /m/                    → index.html
//   - GET /m/assets/<hash>.js    → that file from dist/assets/, with
//                                  long cache (immutable hashed filenames).
//   - GET /m/<anything else>     → SPA fallback to index.html (Vue Router
//                                  handles the route client-side).
//   - GET /m/sw.js, manifest…    → served from dist root with no-cache.
//
// We intentionally keep this on the bootstrap (no-mTLS) router because
// browsers can't present client certificates from JavaScript fetches; the
// mobile app authenticates via JWT bearer obtained at pairing redemption.

//go:embed all:dist
var mobileFS embed.FS

// mobileDistFS is the dist subtree as a regular fs.FS (strips the "dist/"
// prefix from request URLs).
var mobileDistFS fs.FS = mustSub(mobileFS, "dist")

func mustSub(f embed.FS, dir string) fs.FS {
	sub, err := fs.Sub(f, dir)
	if err != nil {
		// Programmer error: dir must exist (we ship a placeholder).
		panic("mobile dist embed missing: " + err.Error())
	}
	return sub
}

// MobileSPAHandler returns an http.Handler that serves the PWA on /m/*.
// It must be mounted with a trailing wildcard (e.g. r.Handle("/m/*", h)).
func MobileSPAHandler() http.Handler {
	fileSrv := http.FileServer(http.FS(mobileDistFS))

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Strip the /m prefix; the embedded FS is rooted at dist/.
		// Caddy may forward /m/anything OR /m exactly; normalize.
		raw := strings.TrimPrefix(r.URL.Path, "/m")
		if raw == "" {
			raw = "/"
		}

		// Compute the candidate file path inside the embed FS.
		clean := path.Clean(raw)
		if clean == "/" || clean == "." {
			serveIndex(w, r)
			return
		}

		// Probe the file: if it exists, serve it via the file server with
		// appropriate caching headers based on extension/path. If missing
		// (typical for client-side routes like /m/account), fall back to
		// index.html so Vue Router can take over.
		fp := strings.TrimPrefix(clean, "/")
		if _, err := fs.Stat(mobileDistFS, fp); err != nil {
			serveIndex(w, r)
			return
		}

		setCacheHeaders(w, fp)

		// Rewrite r.URL so the underlying FileServer sees the dist-relative
		// path (without the /m prefix).
		r2 := r.Clone(r.Context())
		r2.URL.Path = clean
		r2.URL.RawPath = ""
		fileSrv.ServeHTTP(w, r2)
	})
}

// serveIndex writes index.html with no-cache headers (the SW handles
// freshness; we never want browsers to pin a stale shell).
func serveIndex(w http.ResponseWriter, r *http.Request) {
	data, err := fs.ReadFile(mobileDistFS, "index.html")
	if err != nil {
		http.Error(w, "mobile app not built", http.StatusServiceUnavailable)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	// Allow the PWA to be embedded only by itself (clickjacking guard).
	w.Header().Set("X-Frame-Options", "DENY")
	w.Header().Set("Referrer-Policy", "no-referrer")
	http.ServeContent(w, r, "index.html", time.Now(), strings.NewReader(string(data)))
}

// setCacheHeaders applies caching policy based on the file path.
//
//   - /assets/<hash>.<ext> from Vite are content-hashed → 1y immutable.
//   - The service worker (sw.js) and manifest must NOT be cached so updates
//     propagate immediately.
//   - Everything else gets a short cache.
func setCacheHeaders(w http.ResponseWriter, fp string) {
	switch {
	case strings.HasPrefix(fp, "assets/"):
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	case fp == "sw.js" || fp == "manifest.webmanifest" || fp == "registerSW.js":
		w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
		// Some browsers treat the SW response with stale headers as
		// out-of-date; explicit Service-Worker-Allowed widens scope.
		if fp == "sw.js" {
			w.Header().Set("Service-Worker-Allowed", "/m/")
		}
	default:
		w.Header().Set("Cache-Control", "public, max-age=300")
	}
}
