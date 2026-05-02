// Package updater scarica e installa nuove versioni dell'app
// dall'object storage R2 di Cloudflare.
//
// Flusso:
//
//  1. CheckLatest()   GET https://<host>/desktop/<channel>/latest.json
//  2. confronto semver con la versione corrente
//  3. Download()      scarica installer in %TEMP%, verifica SHA-256
//  4. LaunchInstaller() spawna installer con /SILENT /UPDATE e chiude l'app
//
// Nessuna scrittura su R2: il client conosce solo l'URL pubblico e
// non possiede credenziali. Il manifest e l'installer sono firmati
// implicitamente dalla loro pubblicazione attraverso il bucket privato
// (autenticato lato sviluppatore via publish-desktop.ps1).
package updater

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// Release rappresenta il manifest pubblicato in R2 (latest.json).
type Release struct {
	Version      string `json:"version"`       // "0.1.2"
	ReleaseDate  string `json:"release_date"`  // "2026-05-02"
	InstallerURL string `json:"installer_url"` // URL diretto al .exe
	SHA256       string `json:"sha256"`        // hash hex lowercase del .exe
	SizeBytes    int64  `json:"size_bytes"`
	NotesMd      string `json:"notes_md"` // markdown changelog
	MinVersion   string `json:"min_version,omitempty"`
}

// Updater incapsula configurazione + http client.
type Updater struct {
	// ManifestURL e' l'URL completo a latest.json, es:
	// "https://pub-xxx.r2.dev/desktop/stable/latest.json"
	ManifestURL string

	// HTTPClient consente injection in test. Default: http.DefaultClient.
	HTTPClient *http.Client
}

// New restituisce un Updater con timeout HTTP ragionevoli.
func New(manifestURL string) *Updater {
	return &Updater{
		ManifestURL: manifestURL,
		HTTPClient:  &http.Client{Timeout: 30 * time.Second},
	}
}

// CheckLatest scarica e parsa latest.json. Restituisce errore distinto
// per problemi di rete vs JSON malformato cosi' la UI puo' decidere
// se loggare silenziosamente o mostrare un toast all'utente.
func (u *Updater) CheckLatest() (*Release, error) {
	if u.ManifestURL == "" {
		return nil, errors.New("updater: manifest URL non configurato")
	}
	req, err := http.NewRequest(http.MethodGet, u.ManifestURL, nil)
	if err != nil {
		return nil, err
	}
	// Disabilita la cache HTTP del client: vogliamo sempre l'ultimo
	// stato del manifest (gia' cache-controlled lato CDN).
	req.Header.Set("Cache-Control", "no-cache")
	resp, err := u.HTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("updater: richiesta manifest fallita: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("updater: manifest HTTP %d", resp.StatusCode)
	}
	var rel Release
	if err := json.NewDecoder(resp.Body).Decode(&rel); err != nil {
		return nil, fmt.Errorf("updater: manifest JSON invalido: %w", err)
	}
	if rel.Version == "" || rel.InstallerURL == "" || rel.SHA256 == "" {
		return nil, errors.New("updater: manifest incompleto")
	}
	return &rel, nil
}

// IsNewer ritorna true se 'candidate' e' un semver strettamente maggiore
// di 'current'. Versione "dev" e' considerata sempre obsoleta (così in
// dev locale il banner di update e' visibile dopo aver pubblicato).
func IsNewer(current, candidate string) bool {
	if current == "dev" || current == "" {
		return true
	}
	return compareSemver(candidate, current) > 0
}

// compareSemver confronta due semver "X.Y.Z" (ignorando suffissi
// pre-release per semplicita'). Ritorna -1/0/1.
func compareSemver(a, b string) int {
	pa := parseSemver(a)
	pb := parseSemver(b)
	for i := 0; i < 3; i++ {
		if pa[i] != pb[i] {
			if pa[i] < pb[i] {
				return -1
			}
			return 1
		}
	}
	return 0
}

func parseSemver(s string) [3]int {
	var out [3]int
	// strip leading 'v' o 'V' e suffix pre-release
	s = strings.TrimPrefix(strings.TrimPrefix(s, "v"), "V")
	if i := strings.IndexAny(s, "-+"); i >= 0 {
		s = s[:i]
	}
	parts := strings.SplitN(s, ".", 3)
	for i, p := range parts {
		if i >= 3 {
			break
		}
		n, _ := strconv.Atoi(p)
		out[i] = n
	}
	return out
}

// ProgressFunc viene invocata periodicamente durante Download con il
// numero di byte scaricati e quelli totali (-1 se sconosciuto).
type ProgressFunc func(downloaded, total int64)

// Download scarica l'installer in %TEMP%, verifica SHA-256 e ritorna
// il path locale. Se la verifica fallisce il file viene eliminato.
func (u *Updater) Download(rel *Release, progress ProgressFunc) (string, error) {
	if rel == nil {
		return "", errors.New("updater: release nil")
	}
	tmp := filepath.Join(os.TempDir(),
		fmt.Sprintf("bookeeper-update-%s.exe", rel.Version))

	out, err := os.Create(tmp)
	if err != nil {
		return "", fmt.Errorf("updater: creazione file temp: %w", err)
	}

	req, err := http.NewRequest(http.MethodGet, rel.InstallerURL, nil)
	if err != nil {
		out.Close()
		os.Remove(tmp)
		return "", err
	}
	resp, err := u.HTTPClient.Do(req)
	if err != nil {
		out.Close()
		os.Remove(tmp)
		return "", fmt.Errorf("updater: download fallito: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		out.Close()
		os.Remove(tmp)
		return "", fmt.Errorf("updater: download HTTP %d", resp.StatusCode)
	}

	hasher := sha256.New()
	total := resp.ContentLength
	var written int64
	buf := make([]byte, 64*1024)
	lastReport := time.Now()
	for {
		n, rerr := resp.Body.Read(buf)
		if n > 0 {
			if _, werr := out.Write(buf[:n]); werr != nil {
				out.Close()
				os.Remove(tmp)
				return "", werr
			}
			hasher.Write(buf[:n])
			written += int64(n)
			// Throttle: massimo un report ogni 100ms per non
			// inondare il bridge Wails di eventi.
			if progress != nil && time.Since(lastReport) > 100*time.Millisecond {
				progress(written, total)
				lastReport = time.Now()
			}
		}
		if rerr == io.EOF {
			break
		}
		if rerr != nil {
			out.Close()
			os.Remove(tmp)
			return "", rerr
		}
	}
	if err := out.Close(); err != nil {
		os.Remove(tmp)
		return "", err
	}
	if progress != nil {
		progress(written, written)
	}

	got := hex.EncodeToString(hasher.Sum(nil))
	want := strings.ToLower(strings.TrimSpace(rel.SHA256))
	if got != want {
		os.Remove(tmp)
		return "", fmt.Errorf("updater: SHA256 non corrisponde (atteso %s, ricevuto %s)", want, got)
	}
	return tmp, nil
}

// LaunchInstaller spawna l'installer NSIS in modalita' silent+update,
// poi termina il processo corrente cosi' Windows puo' sostituire il .exe.
//
// Convenzione del nostro project.nsi:
//   - /S       : flag NSIS standard, esegue in modalita' silent
//   - /UPDATE  : custom — salta pagine welcome/license e disattiva il
//                shortcut sul desktop (gia' presente da install precedente)
func LaunchInstaller(installerPath string) error {
	cmd := exec.Command(installerPath, "/S", "/UPDATE")
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("updater: lancio installer: %w", err)
	}
	// Lasciamo l'installer continuare in background. Non Wait().
	return nil
}
