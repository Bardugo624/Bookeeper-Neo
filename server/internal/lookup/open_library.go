package lookup

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// OpenLibraryProvider queries the public OL API:
//   https://openlibrary.org/api/books?bibkeys=ISBN:{isbn}&jscmd=data&format=json
// for metadata, and
//   https://covers.openlibrary.org/b/isbn/{isbn}-L.jpg?default=false
// as the canonical cover URL (404 when missing instead of a 1x1 pixel).
//
// OL coverage is poor for Italian publishers but solid as a third-tier
// fallback: it sometimes has authors/publishers that GoogleBooks and
// AnnasArchive both miss. Used last so it never overrides the others.
type OpenLibraryProvider struct {
	httpClient *http.Client
	userAgent  string
}

// NewOpenLibrary builds an OpenLibrary provider.
func NewOpenLibrary(userAgent string, timeout time.Duration) *OpenLibraryProvider {
	return &OpenLibraryProvider{
		httpClient: &http.Client{Timeout: timeout},
		userAgent:  userAgent,
	}
}

// Name implements Provider.
func (o *OpenLibraryProvider) Name() string { return "open-library" }

// Lookup implements Provider.
func (o *OpenLibraryProvider) Lookup(isbn string) (*Metadata, error) {
	q := url.Values{}
	q.Set("bibkeys", "ISBN:"+isbn)
	q.Set("jscmd", "data")
	q.Set("format", "json")
	endpoint := "https://openlibrary.org/api/books?" + q.Encode()

	req, err := http.NewRequest(http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", o.userAgent)
	req.Header.Set("Accept", "application/json")

	resp, err := o.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("open-library: transient: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	switch {
	case resp.StatusCode == 404:
		return nil, nil
	case resp.StatusCode == 429, resp.StatusCode >= 500:
		return nil, fmt.Errorf("open-library: transient: status %d", resp.StatusCode)
	case resp.StatusCode != 200:
		return nil, nil
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, fmt.Errorf("open-library: transient: read: %w", err)
	}

	// OL returns an object keyed by the bibkey. Decode loose then pick.
	var raw map[string]struct {
		URL      string `json:"url"`
		Title    string `json:"title"`
		Subtitle string `json:"subtitle"`
		Authors  []struct {
			Name string `json:"name"`
		} `json:"authors"`
		Publishers []struct {
			Name string `json:"name"`
		} `json:"publishers"`
		PublishDate   string `json:"publish_date"`
		NumberOfPages int    `json:"number_of_pages"`
		Identifiers   struct {
			ISBN10 []string `json:"isbn_10"`
			ISBN13 []string `json:"isbn_13"`
		} `json:"identifiers"`
		Cover struct {
			Small  string `json:"small"`
			Medium string `json:"medium"`
			Large  string `json:"large"`
		} `json:"cover"`
		Notes  string `json:"notes"`
		Excerpts []struct {
			Text string `json:"text"`
		} `json:"excerpts"`
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, fmt.Errorf("open-library: transient: decode: %w", err)
	}
	v, ok := raw["ISBN:"+isbn]
	if !ok {
		return nil, nil // no record for this ISBN
	}

	out := &Metadata{
		Title:       v.Title,
		Subtitle:    v.Subtitle,
		PageCount:   v.NumberOfPages,
		PublishYear: parseFirstYear(v.PublishDate),
		SourceURL:   v.URL,
	}
	for _, a := range v.Authors {
		if a.Name != "" {
			out.Authors = append(out.Authors, a.Name)
		}
	}
	if len(v.Publishers) > 0 {
		out.Publisher = v.Publishers[0].Name
	}
	if len(v.Identifiers.ISBN10) > 0 {
		out.ISBN10 = strings.ToUpper(v.Identifiers.ISBN10[0])
	}
	if len(v.Identifiers.ISBN13) > 0 {
		out.ISBN13 = v.Identifiers.ISBN13[0]
	}
	if v.Notes != "" {
		out.Description = v.Notes
	} else if len(v.Excerpts) > 0 {
		out.Description = v.Excerpts[0].Text
	}

	// Cover candidates from the API response, plus a deterministic
	// fallback URL by ISBN. We probe-by-ISBN even when the API gave
	// nothing: covers.openlibrary.org sometimes has the image even if
	// the metadata API doesn't expose it.
	if v.Cover.Large != "" {
		out.CoverCandidates = append(out.CoverCandidates, v.Cover.Large)
	}
	if v.Cover.Medium != "" {
		out.CoverCandidates = append(out.CoverCandidates, v.Cover.Medium)
	}
	if v.Cover.Small != "" {
		out.CoverCandidates = append(out.CoverCandidates, v.Cover.Small)
	}
	out.CoverCandidates = append(out.CoverCandidates,
		"https://covers.openlibrary.org/b/isbn/"+isbn+"-L.jpg?default=false",
	)
	if len(out.CoverCandidates) > 0 {
		out.CoverURL = out.CoverCandidates[0]
	}
	return out, nil
}
