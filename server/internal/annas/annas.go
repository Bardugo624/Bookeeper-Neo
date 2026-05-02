// Package annas implementa un provider read-only per Anna's Archive.
//
// NOTA: questo file e' duplicato in due moduli Go separati:
//   - server/internal/annas/annas.go     (qui — usato dal server)
//   - clients/desktop/internal/annas/    (usato dall'app desktop Wails)
//
// Mantieni le due copie allineate finche' non introdurremo un Go
// workspace (go.work) o un modulo `pkg/annas` condiviso.
//
// L'unico endpoint che usiamo e' la pagina HTML pubblica `/isbn/<isbn>`
// (e la sua variante di ricerca `/search?q=<query>&isbn=<isbn>`),
// dalla quale estraiamo solo i tag `<meta property="og:*">` + qualche
// data-attribute stabile per ricavare titolo, autori, editore, anno,
// lingua e URL della copertina.
//
// PRINCIPI:
//   - solo metadati pubblicamente visibili nella pagina HTML;
//   - mai link a download / mai distribuzione di file protetti;
//   - User-Agent identificato come Bookeeper (no spoofing di Chrome);
//   - rate limit interno (1 req ogni 1500ms) per evitare ban IP;
//   - cache di sessione in-memory: ISBN positivi e negativi.
//
// Se Cloudflare blocca o la pagina cambia struttura, Lookup ritorna
// (nil, nil) e il chiamante puo' degradare al provider successivo.
package annas

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Info e' il risultato di un lookup. Tutti i campi sono best-effort:
// quelli che il parser non riesce a estrarre restano vuoti / 0.
type Info struct {
	Title       string   `json:"title"`
	Subtitle    string   `json:"subtitle"`
	Authors     []string `json:"authors"`
	Publisher   string   `json:"publisher"`
	PublishYear int      `json:"publishYear"`
	PageCount   int      `json:"pageCount"`
	Language    string   `json:"language"`
	Description string   `json:"description"`
	ISBN10      string   `json:"isbn10"`
	ISBN13      string   `json:"isbn13"`
	CoverURL    string   `json:"coverUrl"`
	SourceURL   string   `json:"sourceUrl"`
}

// ErrTransient indica un fallimento temporaneo (rete, 5xx, Cloudflare
// challenge): il chiamante NON dovrebbe metterlo in negative cache.
var ErrTransient = errors.New("annas: transient error")

// Mirror probati in ordine. Il primo che risponde 200 vince.
// `.org` e' quello principale; gli altri sono geo-mirror ufficiali.
var mirrors = []string{
	"https://annas-archive.org",
	"https://annas-archive.gl",
	"https://annas-archive.li",
	"https://annas-archive.se",
}

// Provider e' un client riutilizzabile. Crearne UNO per processo.
type Provider struct {
	httpClient *http.Client
	userAgent  string

	mu           sync.Mutex
	lastRequest  time.Time
	minInterval  time.Duration
	posCache     map[string]*Info // ISBN -> Info (hit positivi)
	negCache     map[string]time.Time // ISBN -> when negativized
	cacheTTL     time.Duration
}

// New crea un Provider con timeout e rate limit ragionevoli per un
// client desktop a singolo utente.
func New(userAgent string) *Provider {
	if userAgent == "" {
		userAgent = "Bookeeper/0.0.0 (+https://github.com/Bardugo624/Bookeeper-Neo)"
	}
	return &Provider{
		httpClient: &http.Client{
			Timeout: 12 * time.Second,
			// Anna's Archive usa redirect tra mirror e dalla
			// pagina /isbn/ alla scheda /md5/. Seguiamo fino a 5.
			CheckRedirect: func(req *http.Request, via []*http.Request) error {
				if len(via) >= 5 {
					return http.ErrUseLastResponse
				}
				return nil
			},
		},
		userAgent:   userAgent,
		minInterval: 1500 * time.Millisecond,
		posCache:    make(map[string]*Info, 256),
		negCache:    make(map[string]time.Time, 256),
		cacheTTL:    24 * time.Hour,
	}
}

// normalizeISBN rimuove tutto cio' che non e' cifra o X.
func normalizeISBN(s string) string {
	var b strings.Builder
	for _, r := range s {
		if (r >= '0' && r <= '9') || r == 'X' || r == 'x' {
			if r == 'x' {
				r = 'X'
			}
			b.WriteRune(r)
		}
	}
	return b.String()
}

// Lookup recupera l'Info per un ISBN. Politica:
//   - cache hit positiva: ritorna subito;
//   - cache hit negativa fresca: ritorna (nil, nil);
//   - altrimenti tenta i mirror in ordine.
//
// Ritorna (nil, nil) se l'ISBN non esiste in AA (negative).
// Ritorna (nil, ErrTransient) se tutti i mirror danno errori temporanei.
func (p *Provider) Lookup(ctx context.Context, rawISBN string) (*Info, error) {
	isbn := normalizeISBN(rawISBN)
	if len(isbn) != 10 && len(isbn) != 13 {
		return nil, nil
	}

	p.mu.Lock()
	if hit, ok := p.posCache[isbn]; ok {
		p.mu.Unlock()
		return hit, nil
	}
	if t, ok := p.negCache[isbn]; ok && time.Since(t) < p.cacheTTL {
		p.mu.Unlock()
		return nil, nil
	}
	p.mu.Unlock()

	var lastErr error
	for _, mirror := range mirrors {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		p.throttle()

		info, err := p.fetchOne(ctx, mirror, isbn)
		if err == nil && info != nil {
			p.mu.Lock()
			p.posCache[isbn] = info
			p.mu.Unlock()
			return info, nil
		}
		if err == nil && info == nil {
			// 404 esplicito: ISBN non presente in AA.
			p.mu.Lock()
			p.negCache[isbn] = time.Now()
			p.mu.Unlock()
			return nil, nil
		}
		lastErr = err
	}
	if lastErr != nil {
		return nil, lastErr
	}
	return nil, ErrTransient
}

// throttle blocca finche' non e' passato `minInterval` dall'ultima
// richiesta. Garantisce un solo throttle attivo alla volta.
func (p *Provider) throttle() {
	p.mu.Lock()
	wait := p.minInterval - time.Since(p.lastRequest)
	if wait > 0 {
		p.mu.Unlock()
		time.Sleep(wait)
		p.mu.Lock()
	}
	p.lastRequest = time.Now()
	p.mu.Unlock()
}

// fetchOne tenta una richiesta a `<mirror>/isbn/<isbn>`. Ritorni:
//   - (info, nil)  → trovato e parsato
//   - (nil,  nil)  → 404 (ISBN sconosciuto a questo mirror)
//   - (nil,  err)  → errore transiente (rete, 5xx, CF challenge)
func (p *Provider) fetchOne(ctx context.Context, mirror, isbn string) (*Info, error) {
	url := mirror + "/isbn/" + isbn

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", p.userAgent)
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
	req.Header.Set("Accept-Language", "it,en;q=0.9")

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrTransient, err)
	}
	defer func() { _ = resp.Body.Close() }()

	switch {
	case resp.StatusCode == 404:
		return nil, nil
	case resp.StatusCode == 403, resp.StatusCode == 503:
		// Tipici status di Cloudflare challenge → transiente, prossimo
		// mirror potrebbe rispondere.
		return nil, fmt.Errorf("%w: status %d", ErrTransient, resp.StatusCode)
	case resp.StatusCode >= 500:
		return nil, fmt.Errorf("%w: status %d", ErrTransient, resp.StatusCode)
	case resp.StatusCode != 200:
		return nil, fmt.Errorf("%w: status %d", ErrTransient, resp.StatusCode)
	}

	// Limitiamo la lettura a 1 MiB: la pagina /isbn/ tipica e' ~80–250 KiB.
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, fmt.Errorf("%w: read body: %v", ErrTransient, err)
	}
	html := string(body)

	// Sentinel: se la pagina contiene il messaggio "Sorry, no records found"
	// (o equivalente), trattiamo come 404 logico.
	if strings.Contains(html, "no records") || strings.Contains(html, "Nessun risultato") {
		return nil, nil
	}

	info := parseISBNPage(html, isbn)
	if info == nil {
		return nil, fmt.Errorf("%w: parse failed", ErrTransient)
	}
	info.SourceURL = url
	return info, nil
}

// ===== HTML parsing (regex-based, intenzionalmente minimale) ==================

// I selettori `<meta>` sono stabili nel layout di AA da anni perche'
// servono ai bot (OG/Twitter cards). Il body markup invece cambia
// spesso, quindi lo evitiamo dove possibile.

var (
	reOgTitle     = regexp.MustCompile(`(?is)<meta\s+[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']`)
	reOgDesc      = regexp.MustCompile(`(?is)<meta\s+[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']`)
	reOgImage     = regexp.MustCompile(`(?is)<meta\s+[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']`)
	reTwImage     = regexp.MustCompile(`(?is)<meta\s+[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']`)
	rePageCount   = regexp.MustCompile(`(?i)(\d+)\s*pages?\b`)
	reYearAny     = regexp.MustCompile(`\b(1[5-9]\d{2}|20\d{2}|21\d{2})\b`)
	reLangISO     = regexp.MustCompile(`(?i)\b(?:language|lingua)\s*[:\-]?\s*([a-z]{2,3})\b`)
	reISBN13      = regexp.MustCompile(`\b97[89]\d{10}\b`)
	reISBN10      = regexp.MustCompile(`\b\d{9}[\dXx]\b`)
)

// parseISBNPage prova a costruire un Info dal contenuto HTML della
// pagina `/isbn/<isbn>` di Anna's Archive. Ritorna nil solo se NESSUN
// campo principale (titolo o cover) e' stato estratto.
func parseISBNPage(html, isbn string) *Info {
	info := &Info{}

	if m := reOgTitle.FindStringSubmatch(html); len(m) == 2 {
		info.Title = decodeHTMLEntities(strings.TrimSpace(m[1]))
	}
	if m := reOgDesc.FindStringSubmatch(html); len(m) == 2 {
		info.Description = decodeHTMLEntities(strings.TrimSpace(m[1]))
	}
	if m := reOgImage.FindStringSubmatch(html); len(m) == 2 {
		info.CoverURL = strings.TrimSpace(m[1])
	} else if m := reTwImage.FindStringSubmatch(html); len(m) == 2 {
		info.CoverURL = strings.TrimSpace(m[1])
	}

	// AA mette in og:description una stringa concatenata tipo:
	//   "Publisher, Year. ISBN 9788804... Author Name. ..."
	// Estriamo da li' editore/anno/autori best-effort.
	if info.Description != "" {
		populateFromDescription(info)
	}

	// Lingua: cerchiamo "Language: it" o "Lingua: it" nel body.
	if m := reLangISO.FindStringSubmatch(html); len(m) == 2 {
		info.Language = strings.ToLower(m[1])
	}

	// Pagine: prima occorrenza di "<n> pages" nel body.
	if m := rePageCount.FindStringSubmatch(html); len(m) == 2 {
		if n, err := strconv.Atoi(m[1]); err == nil && n > 0 && n < 20000 {
			info.PageCount = n
		}
	}

	// ISBN: confermiamo dal body (alcune edizioni hanno anche l'altro
	// formato listato).
	if isbn13 := reISBN13.FindString(html); isbn13 != "" {
		info.ISBN13 = isbn13
	} else if len(isbn) == 13 {
		info.ISBN13 = isbn
	}
	if isbn10 := reISBN10.FindString(html); isbn10 != "" && isbn10 != info.ISBN13 {
		info.ISBN10 = strings.ToUpper(isbn10)
	} else if len(isbn) == 10 {
		info.ISBN10 = strings.ToUpper(isbn)
	}

	// Sanity check: senza titolo NE' cover questa pagina e' inservibile.
	if info.Title == "" && info.CoverURL == "" {
		return nil
	}
	return info
}

// populateFromDescription estrae editore/anno/autori da og:description.
// Formato osservato (puo' variare): "Editore, 2015. Autore Tale. Genere..."
// oppure "Author Name; Author Two — Publisher (2010) — pages: 320".
// Strategia conservativa: estrai SOLO se troviamo pattern chiari, mai
// sovrascrivere campi gia' valorizzati altrove.
func populateFromDescription(info *Info) {
	desc := info.Description

	// Anno: prima 4-cifre "anno-libro" plausibile.
	if m := reYearAny.FindString(desc); m != "" {
		if n, err := strconv.Atoi(m); err == nil {
			info.PublishYear = n
		}
	}

	// Pagine in description: "320 pages"
	if info.PageCount == 0 {
		if m := rePageCount.FindStringSubmatch(desc); len(m) == 2 {
			if n, err := strconv.Atoi(m[1]); err == nil && n > 0 && n < 20000 {
				info.PageCount = n
			}
		}
	}

	// Tagliamo in segmenti su separatori canonici di AA: " — " o " - ".
	// Il primo segmento e' di solito titolo+sottotitolo, il secondo
	// editore o autori. Manteniamo l'euristica MOLTO conservativa:
	// se non ne siamo sicuri, lasciamo i campi vuoti.
	parts := splitOnAny(desc, []string{" — ", " – ", " - "})
	for _, raw := range parts {
		seg := strings.TrimSpace(raw)
		if seg == "" {
			continue
		}
		// Pattern "Publisher (YYYY)"
		if i := strings.Index(seg, "("); i > 0 && i < len(seg)-5 {
			if reYearAny.MatchString(seg[i:]) && info.Publisher == "" {
				info.Publisher = strings.TrimSpace(seg[:i])
				continue
			}
		}
		// Pattern "Author A; Author B" / "Author A, Author B"
		if len(info.Authors) == 0 && (strings.Contains(seg, ";") || strings.Contains(seg, " by ")) {
			seg = strings.TrimPrefix(seg, "by ")
			candidates := splitOnAny(seg, []string{";", ","})
			authors := make([]string, 0, len(candidates))
			for _, c := range candidates {
				c = strings.TrimSpace(c)
				if len(c) >= 3 && len(c) <= 80 && !strings.ContainsAny(c, "0123456789") {
					authors = append(authors, c)
				}
			}
			if len(authors) > 0 && len(authors) <= 8 {
				info.Authors = authors
			}
		}
	}
}

// splitOnAny suddivide s sui primi separatori trovati. L'ordine dei
// separatori conta: il primo che matcha vince per quel segmento.
func splitOnAny(s string, seps []string) []string {
	for _, sep := range seps {
		if strings.Contains(s, sep) {
			return strings.Split(s, sep)
		}
	}
	return []string{s}
}

// decodeHTMLEntities sostituisce le entita' piu' comuni che appaiono
// in og:title / og:description di AA. Non importiamo html/template per
// non tirar dentro un parser completo per 5 entita'.
func decodeHTMLEntities(s string) string {
	r := strings.NewReplacer(
		"&amp;", "&",
		"&quot;", `"`,
		"&#39;", "'",
		"&apos;", "'",
		"&lt;", "<",
		"&gt;", ">",
		"&nbsp;", " ",
	)
	return r.Replace(s)
}
