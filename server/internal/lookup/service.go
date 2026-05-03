package lookup

import (
	"context"
	"strings"
	"sync"
	"time"
)

// Service is the orchestrator. Construct it once per process via New(),
// pass it to the API handler. Goroutine-safe.
type Service struct {
	providers []Provider

	mu      sync.Mutex
	cache   map[string]cachedEntry // ISBN -> entry; nil value == negative
	posTTL  time.Duration
	negTTL  time.Duration
	maxSize int
}

// New builds the Service with the canonical provider order.
//
// userAgent must identify Bookeeper (e.g. "Bookeeper/0.5.0
// (+https://github.com/...)"). It's forwarded to every provider that
// makes outbound HTTP calls.
//
// httpTimeout is the per-request budget given to each provider.
// 12s is a safe default — the orchestrator's own context still wraps
// everything so the handler-level timeout always wins.
func New(userAgent string, httpTimeout time.Duration) *Service {
	return &Service{
		providers: []Provider{
			NewGoogleBooks(userAgent, httpTimeout),
			NewAnnasArchive(userAgent, httpTimeout),
			NewOpenLibrary(userAgent, httpTimeout),
		},
		cache:   make(map[string]cachedEntry, 512),
		posTTL:  30 * 24 * time.Hour, // 30 days hit
		negTTL:  24 * time.Hour,      // 24 hours miss
		maxSize: 4096,
	}
}

// NormalizeISBN strips everything that's not a digit or X. Exported so
// the API handler can pre-validate before reaching the cache.
func NormalizeISBN(s string) string {
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

// Lookup runs the canonical chain for the given ISBN.
//
// Returns:
//   - (metadata, nil) on hit (at least one provider returned data)
//   - (nil, nil)      on definitive miss (all providers said "no record")
//   - (nil, error)    on transient failure (no provider succeeded AND at
//     least one returned an error). The caller should NOT cache.
//
// Cache semantics: only definitive hits and definitive misses are
// stored. A transient failure leaves the cache untouched so a retry can
// still win.
func (s *Service) Lookup(ctx context.Context, rawISBN string) (*Metadata, error) {
	return s.lookup(ctx, rawISBN, false)
}

// LookupFresh runs the chain skipping the cache GET. It still WRITES
// the freshly fetched result into the cache so subsequent Lookup calls
// benefit. Used by the explicit "force refresh" path on the client
// (cover retry button) to bypass a poisoned 24h negative entry that
// resulted from a transient provider failure.
func (s *Service) LookupFresh(ctx context.Context, rawISBN string) (*Metadata, error) {
	return s.lookup(ctx, rawISBN, true)
}

func (s *Service) lookup(ctx context.Context, rawISBN string, bypassCache bool) (*Metadata, error) {
	isbn := NormalizeISBN(rawISBN)
	if len(isbn) != 10 && len(isbn) != 13 {
		return nil, nil
	}

	if !bypassCache {
		if hit, fresh := s.cacheGet(isbn); fresh {
			return hit, nil // hit may be nil (negative)
		}
	}

	merged := &Metadata{}
	var lastErr error
	gotAny := false
	allDefinitiveMiss := true

	for _, p := range s.providers {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		info, err := p.Lookup(isbn)
		if err != nil {
			// Transient: don't claim "no record" yet, but remember the
			// error in case nobody else succeeds.
			lastErr = err
			allDefinitiveMiss = false
			continue
		}
		if info == nil {
			continue // definitive miss for this provider
		}
		// At least one provider returned actual data.
		gotAny = true
		allDefinitiveMiss = false
		mergeInto(merged, info, p.Name())
	}

	// Promote first cover candidate to CoverURL for back-compat clients.
	if merged.CoverURL == "" && len(merged.CoverCandidates) > 0 {
		merged.CoverURL = merged.CoverCandidates[0]
	}

	switch {
	case gotAny:
		s.cacheSet(isbn, merged, true)
		return merged, nil
	case allDefinitiveMiss:
		// Every provider gave a clean "no record": cache as negative so
		// the next call can short-circuit.
		s.cacheSet(isbn, nil, false)
		return nil, nil
	default:
		// At least one provider was transient: surface the error so the
		// HTTP layer returns 503 and the client can retry later.
		return nil, lastErr
	}
}

// mergeInto applies "first non-empty wins" per scalar field and unions
// cover candidates in source order. Authors get the first non-empty
// list (we don't try to dedupe author names across sources because the
// strings rarely match exactly — "George R.R. Martin" vs "George R. R.
// Martin" — and a wrong dedupe is worse than a duplicate.)
func mergeInto(dst *Metadata, src *Metadata, srcName string) {
	if dst.Title == "" {
		dst.Title = src.Title
	}
	if dst.Subtitle == "" {
		dst.Subtitle = src.Subtitle
	}
	if len(dst.Authors) == 0 && len(src.Authors) > 0 {
		dst.Authors = src.Authors
	}
	if dst.Publisher == "" {
		dst.Publisher = src.Publisher
	}
	if dst.PublishYear == 0 {
		dst.PublishYear = src.PublishYear
	}
	if dst.PageCount == 0 {
		dst.PageCount = src.PageCount
	}
	if dst.Language == "" {
		dst.Language = src.Language
	}
	if dst.Description == "" {
		dst.Description = src.Description
	}
	if dst.Genre == "" {
		dst.Genre = src.Genre
	}
	if dst.Format == "" {
		dst.Format = src.Format
	}
	if dst.ISBN10 == "" {
		dst.ISBN10 = src.ISBN10
	}
	if dst.ISBN13 == "" {
		dst.ISBN13 = src.ISBN13
	}
	if dst.SourceURL == "" {
		dst.SourceURL = src.SourceURL
	}
	// Cover candidates: keep order, dedupe.
	for _, c := range src.CoverCandidates {
		if c == "" {
			continue
		}
		seen := false
		for _, existing := range dst.CoverCandidates {
			if existing == c {
				seen = true
				break
			}
		}
		if !seen {
			dst.CoverCandidates = append(dst.CoverCandidates, c)
		}
	}
	// Single CoverURL emitted by the source: still dedupe into the list.
	if src.CoverURL != "" {
		seen := false
		for _, existing := range dst.CoverCandidates {
			if existing == src.CoverURL {
				seen = true
				break
			}
		}
		if !seen {
			dst.CoverCandidates = append(dst.CoverCandidates, src.CoverURL)
		}
	}
	dst.Sources = append(dst.Sources, srcName)
}

func (s *Service) cacheGet(isbn string) (*Metadata, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	entry, ok := s.cache[isbn]
	if !ok {
		return nil, false
	}
	ttl := s.posTTL
	if entry.value == nil {
		ttl = s.negTTL
	}
	if time.Since(entry.storedAt) > ttl {
		delete(s.cache, isbn)
		return nil, false
	}
	return entry.value, true
}

func (s *Service) cacheSet(isbn string, m *Metadata, _ bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	// Naive eviction: when the map grows past the cap, drop the whole
	// thing. The TTLs make this unlikely in practice (a desktop tenant
	// rarely scans 4k unique ISBNs in 30 days) and avoids dragging in
	// an LRU dependency for a tiny cache.
	if len(s.cache) >= s.maxSize {
		s.cache = make(map[string]cachedEntry, s.maxSize)
	}
	s.cache[isbn] = cachedEntry{value: m, storedAt: time.Now()}
}
