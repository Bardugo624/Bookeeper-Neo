package api

import (
	"net/http"
	"strings"
)

// WellKnown serves the static /.well-known/* documents required for
// platform-specific deep linking into the Bookeeper PWA:
//
//   - /.well-known/apple-app-site-association  (iOS Universal Links)
//   - /.well-known/assetlinks.json              (Android App Links)
//
// Notes:
//   - We have no native iOS/Android binary; this surface still benefits the
//     web app because iOS Safari + Android Chrome will route a tap on a
//     `/m/*` URL to the *installed* PWA (Add to Home Screen) instead of a
//     browser tab when these files are present and well-formed.
//   - AASA is served WITHOUT a `.json` extension by Apple's spec, but with
//     `Content-Type: application/json`. Caddy's default mime detection won't
//     handle that, so we set it explicitly here.
//   - The expected appID for a PWA is a stub bundle id; iOS uses the
//     domain match (apex bundle id is irrelevant for web-only PWAs), but
//     the structure must still validate.
//   - Both files are tiny and immutable per deploy → cache 1h with public
//     cache headers (CDN/Caddy can revalidate).
//
// Mount under BootstrapRouter (no auth, no mTLS) — these endpoints must be
// reachable to the OS *before* any user gesture, including from a fresh
// install with no cookies.
type WellKnownHandlers struct {
	// AppID is the iOS bundle identifier asserted in apple-app-site-association.
	// For a PWA-only deployment a placeholder like "WEBONLY.com.bookeeper.web"
	// is acceptable; iOS does not block AASA without a real Team ID prefix
	// when the app is not installed (we only care about the web fallback).
	AppID string

	// Site is the canonical https origin asserted in assetlinks.json
	// (e.g. "https://bookeeper.albacremisi.org"). Required by Android.
	Site string
}

// AppleAppSiteAssociation responds with the AASA document for iOS.
// Path: /.well-known/apple-app-site-association  (no extension).
func (h *WellKnownHandlers) AppleAppSiteAssociation(w http.ResponseWriter, _ *http.Request) {
	appID := h.AppID
	if appID == "" {
		appID = "WEBONLY.com.bookeeper.web"
	}
	// Hand-built JSON keeps this allocation-free and avoids depending on
	// struct/tag order. Indentation is purely cosmetic for curl debugging.
	body := `{
  "applinks": {
    "details": [
      {
        "appIDs": ["` + appID + `"],
        "components": [
          { "/": "/m/*", "comment": "Bookeeper mobile PWA" }
        ]
      }
    ]
  },
  "webcredentials": {
    "apps": ["` + appID + `"]
  }
}
`
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "public, max-age=3600")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(body))
}

// AssetLinks responds with the assetlinks.json document for Android.
// Path: /.well-known/assetlinks.json
func (h *WellKnownHandlers) AssetLinks(w http.ResponseWriter, _ *http.Request) {
	site := strings.TrimRight(h.Site, "/")
	if site == "" {
		// Best-effort: still return a structurally valid file. Android
		// will simply not route deep links until SERVER_HOST is set.
		site = "https://bookeeper.local"
	}
	body := `[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "web",
      "site": "` + site + `"
    }
  }
]
`
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "public, max-age=3600")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(body))
}
