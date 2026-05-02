// Package version espone la versione dell'app desktop.
//
// Le variabili sono override-abili a build-time via -ldflags, es:
//
//	go build -ldflags "-X desktop/internal/version.Version=0.1.2 \
//	                    -X desktop/internal/version.BuildDate=2026-05-02"
//
// In dev (wails dev / go run) restano i valori di default
// "dev" / "" cosi' che la UI possa mostrare un'etichetta evidente.
package version

// Version e' il semver dell'app (es. "0.1.0"). Override via -ldflags.
var Version = "dev"

// BuildDate e' la data ISO-8601 di build (es. "2026-05-02"). Vuota in dev.
var BuildDate = ""

// Channel distingue stable / beta. Default "stable".
var Channel = "stable"
