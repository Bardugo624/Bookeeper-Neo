package lookup

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"
)

// GoogleBooksProvider queries the public anonymous Volumes API:
//   https://www.googleapis.com/books/v1/volumes?q=isbn:{isbn}
//
// Anonymous quota is per-IP and roughly ~1000 req/day; for a domestic
// tenant with cache that's plenty. If we ever hit the limit we'll add
// GOOGLE_BOOKS_API_KEY without changing the contract.
type GoogleBooksProvider struct {
	httpClient *http.Client
	userAgent  string
}

// NewGoogleBooks builds a GoogleBooks provider with the given timeout.
func NewGoogleBooks(userAgent string, timeout time.Duration) *GoogleBooksProvider {
	return &GoogleBooksProvider{
		httpClient: &http.Client{Timeout: timeout},
		userAgent:  userAgent,
	}
}

// Name implements Provider.
func (g *GoogleBooksProvider) Name() string { return "google-books" }

// Lookup implements Provider.
func (g *GoogleBooksProvider) Lookup(isbn string) (*Metadata, error) {
	q := url.Values{}
	q.Set("q", "isbn:"+isbn)
	q.Set("maxResults", "1")
	q.Set("country", "IT") // bias edition selection toward Italian publishers
	endpoint := "https://www.googleapis.com/books/v1/volumes?" + q.Encode()

	req, err := http.NewRequest(http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", g.userAgent)
	req.Header.Set("Accept", "application/json")

	resp, err := g.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("google-books: transient: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	switch {
	case resp.StatusCode == 404:
		return nil, nil
	case resp.StatusCode == 429, resp.StatusCode >= 500:
		return nil, fmt.Errorf("google-books: transient: status %d", resp.StatusCode)
	case resp.StatusCode != 200:
		// 4xx (other than 404) is a definite no-record from Google's POV.
		return nil, nil
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, fmt.Errorf("google-books: transient: read: %w", err)
	}

	var payload struct {
		TotalItems int `json:"totalItems"`
		Items      []struct {
			VolumeInfo struct {
				Title               string   `json:"title"`
				Subtitle            string   `json:"subtitle"`
				Authors             []string `json:"authors"`
				Publisher           string   `json:"publisher"`
				PublishedDate       string   `json:"publishedDate"`
				PageCount           int      `json:"pageCount"`
				Description         string   `json:"description"`
				Language            string   `json:"language"`
				Categories          []string `json:"categories"`
				PrintType           string   `json:"printType"`
				PreviewLink         string   `json:"previewLink"`
				InfoLink            string   `json:"infoLink"`
				CanonicalVolumeLink string   `json:"canonicalVolumeLink"`
				IndustryIdentifiers []struct {
					Type       string `json:"type"`
					Identifier string `json:"identifier"`
				} `json:"industryIdentifiers"`
				ImageLinks map[string]string `json:"imageLinks"`
			} `json:"volumeInfo"`
		} `json:"items"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, fmt.Errorf("google-books: transient: decode: %w", err)
	}
	if payload.TotalItems == 0 || len(payload.Items) == 0 {
		return nil, nil
	}
	v := payload.Items[0].VolumeInfo

	out := &Metadata{
		Title:       v.Title,
		Subtitle:    v.Subtitle,
		Authors:     v.Authors,
		Publisher:   v.Publisher,
		PageCount:   v.PageCount,
		Description: v.Description,
		Language:    strings.ToLower(v.Language),
		Format:      v.PrintType,
		Genre:       firstBISACBreadcrumb(v.Categories),
	}
	out.PublishYear = parseFirstYear(v.PublishedDate)
	for _, id := range v.IndustryIdentifiers {
		switch id.Type {
		case "ISBN_10":
			out.ISBN10 = id.Identifier
		case "ISBN_13":
			out.ISBN13 = id.Identifier
		}
	}
	out.CoverCandidates = pickGoogleCoverCandidates(v.ImageLinks)
	if len(out.CoverCandidates) > 0 {
		out.CoverURL = out.CoverCandidates[0]
	}
	if v.PreviewLink != "" {
		out.SourceURL = v.PreviewLink
	} else if v.InfoLink != "" {
		out.SourceURL = v.InfoLink
	} else {
		out.SourceURL = v.CanonicalVolumeLink
	}
	return out, nil
}

func parseFirstYear(s string) int {
	if len(s) < 4 {
		return 0
	}
	for i := 0; i+4 <= len(s); i++ {
		chunk := s[i : i+4]
		n, err := strconv.Atoi(chunk)
		if err == nil && n >= 1500 && n <= 2200 {
			return n
		}
	}
	return 0
}

// pickGoogleCoverCandidates returns ordered cover URLs (largest first),
// each present in two variants: zoom=1 (full-bleed when available) then
// the original. Mirrors what desktop's googleBooks.ts already does so
// the probe behaviour stays identical client-side.
//
// IMPORTANTE: quando GoogleBooks espone SOLO `thumbnail` e/o
// `smallThumbnail` (cioe' nessuna delle varianti grandi extraLarge /
// large / medium), il record e' tipicamente un volume "metadata-only"
// senza una vera copertina — l'API ritorna comunque un'immagine
// generica 128xN che NON corrisponde all'edizione (cfr. ISBN
// 9788804406839 → volume J2X7HAAACAAJ). In quel caso restituiamo nil
// cosi' che i candidati di AnnasArchive / OpenLibrary, anche se in
// fondo all'ordine di precedenza, finiscono per primi nella lista
// effettiva probata dal client.
func pickGoogleCoverCandidates(links map[string]string) []string {
	if len(links) == 0 {
		return nil
	}
	hasReal := links["extraLarge"] != "" || links["large"] != "" || links["medium"] != ""
	if !hasReal {
		return nil
	}
	order := []string{"extraLarge", "large", "medium", "thumbnail", "smallThumbnail"}
	var out []string
	seen := make(map[string]struct{})
	for _, key := range order {
		raw := links[key]
		if raw == "" {
			continue
		}
		base := strings.ReplaceAll(raw, "http://", "https://")
		base = strings.ReplaceAll(base, "&edge=curl", "")
		hi := replaceZoom(base, "1")
		if _, ok := seen[hi]; !ok {
			seen[hi] = struct{}{}
			out = append(out, hi)
		}
		if _, ok := seen[base]; !ok {
			seen[base] = struct{}{}
			out = append(out, base)
		}
	}
	return out
}

func replaceZoom(u, n string) string {
	// Replace any &zoom=<digits> with &zoom=<n>. We don't pull in the
	// regexp package for one fixed shape — a manual scan is enough.
	idx := strings.Index(u, "&zoom=")
	if idx < 0 {
		return u
	}
	end := idx + len("&zoom=")
	for end < len(u) && u[end] >= '0' && u[end] <= '9' {
		end++
	}
	return u[:idx+len("&zoom=")] + n + u[end:]
}

// firstBISACBreadcrumb mirrors the desktop cleanCategories behaviour:
// most-specific branch wins, segments joined with " › ". We do a much
// simpler version here (server-side it's only used to fill `genre`):
// pick the longest path, strip ancestor duplicates, render with arrow.
func firstBISACBreadcrumb(cats []string) string {
	if len(cats) == 0 {
		return ""
	}
	type entry struct {
		segs []string
		key  string
	}
	entries := make([]entry, 0, len(cats))
	seen := make(map[string]struct{})
	for _, raw := range cats {
		if raw == "" {
			continue
		}
		var segs []string
		for _, s := range strings.Split(raw, "/") {
			s = strings.Join(strings.Fields(s), " ")
			if s != "" {
				segs = append(segs, s)
			}
		}
		if len(segs) == 0 {
			continue
		}
		key := strings.ToLower(strings.Join(segs, "\x00"))
		if _, dup := seen[key]; dup {
			continue
		}
		seen[key] = struct{}{}
		entries = append(entries, entry{segs: segs, key: key})
	}
	if len(entries) == 0 {
		return ""
	}
	// Drop ancestors of more-specific entries.
	survivors := entries[:0]
	for _, e := range entries {
		isAncestor := false
		prefix := e.key + "\x00"
		for _, other := range entries {
			if &other == &e {
				continue
			}
			if len(other.segs) > len(e.segs) && strings.HasPrefix(other.key+"\x00", prefix) {
				isAncestor = true
				break
			}
		}
		if !isAncestor {
			survivors = append(survivors, e)
		}
	}
	// Pick the deepest; ties broken by original order (already preserved).
	sort.SliceStable(survivors, func(i, j int) bool {
		return len(survivors[i].segs) > len(survivors[j].segs)
	})
	return strings.Join(survivors[0].segs, " \u203a ")
}
