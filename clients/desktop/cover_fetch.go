package main

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// CoverBytes e' il payload restituito a JS dal binding FetchCoverBytes.
// Il campo Data viene serializzato da Wails come array Uint8Array via
// JSON (encoding base64 implicito), quindi su frontend arriva come
// number[] o Uint8Array a seconda della versione di Wails. Il
// frontend lo converte in Blob.
type CoverBytes struct {
	Data        []byte `json:"data"`
	ContentType string `json:"contentType"`
}

// coverFetchClient e' condiviso tra tutte le richieste cover. Timeout
// generoso per OpenLibrary che ogni tanto rallenta. NIENTE mTLS:
// scarichiamo da host pubblici (Google Books, OpenLibrary, ecc.).
var coverFetchClient = &http.Client{
	Timeout: 20 * time.Second,
}

// coverHostWhitelist limita gli host accettati dal binding. Senza
// whitelist il binding diventa un proxy SSRF: il frontend potrebbe
// far scaricare al desktop URL arbitrari (file://, intranet, ecc.).
// Hostname matching: suffix-based per coprire mirror regionali
// (books.google.it, books.google.de...).
var coverHostWhitelist = []string{
	"books.google.com",
	"books.google.",
	"covers.openlibrary.org",
	"openlibrary.org",
	"annas-archive.org",
	"annas-archive.se",
	"annas-archive.li",
	"1lib.sk",
}

const maxCoverBytes = 8 * 1024 * 1024 // 8 MB: cap di sicurezza

// FetchCoverBytes scarica i bytes di una copertina da un URL pubblico
// validato contro la whitelist e li ritorna al frontend. Pensato per
// essere chiamato dal cover cache del frontend al primo accesso a una
// copertina nuova: il risultato viene salvato in IndexedDB come Blob
// per la persistenza vera (immune all'eviction del cache HTTP del
// WebView2).
//
// Errori:
//   - URL malformato o scheme diverso da https → errore
//   - host non in whitelist → errore (anti-SSRF)
//   - HTTP non 2xx → errore con status code
//   - content-type non image/* → errore
//   - body > 8MB → errore (cover patologica)
func (a *App) FetchCoverBytes(rawURL string) (CoverBytes, error) {
	if rawURL == "" {
		return CoverBytes{}, errors.New("cover: URL vuoto")
	}
	u, err := url.Parse(rawURL)
	if err != nil {
		return CoverBytes{}, fmt.Errorf("cover: URL non valido: %w", err)
	}
	if u.Scheme != "https" && u.Scheme != "http" {
		return CoverBytes{}, fmt.Errorf("cover: scheme non supportato: %q", u.Scheme)
	}
	host := strings.ToLower(u.Hostname())
	if !isCoverHostAllowed(host) {
		return CoverBytes{}, fmt.Errorf("cover: host non consentito: %q", host)
	}

	req, err := http.NewRequest("GET", rawURL, nil)
	if err != nil {
		return CoverBytes{}, fmt.Errorf("cover: req: %w", err)
	}
	// Google Books rifiuta richieste senza UA "browser-like": usiamo
	// la stessa stringa che il WebView2 manderebbe.
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Bookeeper/1.0")
	req.Header.Set("Accept", "image/*,*/*;q=0.8")

	resp, err := coverFetchClient.Do(req)
	if err != nil {
		return CoverBytes{}, fmt.Errorf("cover: fetch: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return CoverBytes{}, fmt.Errorf("cover: HTTP %d", resp.StatusCode)
	}

	ct := resp.Header.Get("Content-Type")
	if ct != "" && !strings.HasPrefix(strings.ToLower(ct), "image/") {
		return CoverBytes{}, fmt.Errorf("cover: content-type non immagine: %q", ct)
	}
	if ct == "" {
		ct = "image/jpeg"
	}

	// Cap difensivo sulla size — usiamo io.LimitReader cosi' un body
	// patologico non esaurisce la RAM dell'app.
	body, err := io.ReadAll(io.LimitReader(resp.Body, maxCoverBytes+1))
	if err != nil {
		return CoverBytes{}, fmt.Errorf("cover: lettura body: %w", err)
	}
	if len(body) > maxCoverBytes {
		return CoverBytes{}, fmt.Errorf("cover: body troppo grande (>%d bytes)", maxCoverBytes)
	}

	return CoverBytes{Data: body, ContentType: ct}, nil
}

// isCoverHostAllowed verifica se host matcha una entry della whitelist.
// Un'entry che termina con `.` o `:` viene trattata come prefisso
// (es. "books.google." → matcha "books.google.com" e "books.google.it").
// Altrimenti deve essere uguaglianza esatta.
func isCoverHostAllowed(host string) bool {
	for _, allowed := range coverHostWhitelist {
		if strings.HasSuffix(allowed, ".") {
			if strings.HasPrefix(host, allowed) {
				return true
			}
		} else if host == allowed {
			return true
		}
	}
	return false
}
