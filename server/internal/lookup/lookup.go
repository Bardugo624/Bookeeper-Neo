// Package lookup unifies external book-metadata sources behind a single
// service so that ALL clients (desktop, mobile, future ones) receive the
// same shape and the same provider precedence — regardless of whether
// the client could fetch from the providers directly or not.
//
// Background. Before this package the three ingestion paths diverged:
//   - mobile PWA called OpenLibrary + GoogleBooks + the AnnasArchive
//     proxy from the browser, mapping each one onto a different shape;
//   - desktop did GoogleBooks + a local Wails AnnasArchive binding, with
//     a 4-step cover-fallback chain it ran client-side;
//   - cover download (desktop) shared partial logic with the metadata
//     lookup but with subtly different probing rules.
//
// Result: mobile books were missing genre/language/description/format
// while desktop books had them; cover hit rate differed by client; the
// negative-cache TTLs were inconsistent. This package centralises the
// merge so that every client gets the same union of fields.
//
// Provider precedence (defined in service.go):
//  1. GoogleBooks  — best general-purpose metadata, anonymous quota.
//  2. AnnasArchive — best for Italian/niche editions, also high-res cover.
//  3. OpenLibrary  — last fallback, also covers a separate cover URL.
//
// Field-level merge: per-field, "first non-empty wins" so that GB's rich
// description survives even if AA later returns a (better) cover URL.
// Cover URLs are accumulated in source order so the client can probe
// them in turn and pick the first one that renders without placeholders.
//
// Caching is in-memory per process: positive hits 30 days, negative
// (no-record) hits 24 hours. Mirrors what the previous annas.Provider
// did, applied uniformly to all sources.
package lookup

import "time"

// Metadata is the unified shape returned to all clients. Fields not
// available from any source remain at their zero value.
//
// JSON tags use camelCase to match what the existing AnnasResponse
// already serializes — this keeps the mobile-web parser unchanged when
// it switches over.
type Metadata struct {
	Title       string   `json:"title"`
	Subtitle    string   `json:"subtitle"`
	Authors     []string `json:"authors"`
	Publisher   string   `json:"publisher"`
	PublishYear int      `json:"publishYear"`
	PageCount   int      `json:"pageCount"`
	Language    string   `json:"language"`
	Description string   `json:"description"`
	// Genre is the first BISAC category from GoogleBooks (when present),
	// already normalised to a single breadcrumb string ("Fiction › Fantasy
	// › Epic"). Other providers don't supply it; the client may overwrite
	// it manually after import.
	Genre string `json:"genre"`
	// Format is "BOOK" / "MAGAZINE" / "" — only GoogleBooks reports it.
	Format string `json:"format"`
	ISBN10 string `json:"isbn10"`
	ISBN13 string `json:"isbn13"`
	// CoverURL is the highest-priority candidate (== CoverCandidates[0]
	// when CoverCandidates is non-empty). Present for backward compat
	// with the previous AnnasResponse contract.
	CoverURL string `json:"coverUrl"`
	// CoverCandidates is the full ordered list of cover URLs (de-duped),
	// from the most authoritative source down. Clients should probe each
	// in order and use the first that passes their placeholder check.
	CoverCandidates []string `json:"coverCandidates"`
	// SourceURL is the canonical "view this book at the source" URL of
	// whichever provider supplied the strongest match. Mostly diagnostic.
	SourceURL string `json:"sourceUrl"`
	// Sources lists the providers that contributed at least one field,
	// in order of contribution. Diagnostic; clients can render it.
	Sources []string `json:"sources"`
}

// IsEmpty reports whether the metadata carries no usable information at
// all. Used by the orchestrator to decide whether to short-circuit to
// 404 or return an aggregated response.
func (m Metadata) IsEmpty() bool {
	return m.Title == "" && m.CoverURL == "" && len(m.Authors) == 0
}

// Provider is the contract every metadata source implements. The
// Service composes providers in order; each Lookup call is a best
// effort and is allowed to return (nil, nil) for "no record".
type Provider interface {
	// Name is a stable lowercase identifier ("google-books", "annas",
	// "open-library"). Reported in Metadata.Sources for diagnostics.
	Name() string
	// Lookup retrieves metadata for the (already-normalised) ISBN.
	// Returns (nil, nil) for a definite miss; (nil, err) for a transient
	// failure the caller should NOT cache as negative.
	Lookup(isbn string) (*Metadata, error)
}

// cachedEntry is what the Service stores per ISBN.
type cachedEntry struct {
	value    *Metadata // nil = negative
	storedAt time.Time
}
