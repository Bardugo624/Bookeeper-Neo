package lookup

import (
	"context"
	"errors"
	"time"

	"github.com/bookeeper/bookeeper-neo/server/internal/annas"
)

// AnnasArchiveProvider wraps the existing annas.Provider behind the
// uniform Provider interface. Reuses its internal mirror chain, rate
// limiter, and cover-URL extraction logic — we don't reimplement.
type AnnasArchiveProvider struct {
	inner   *annas.Provider
	timeout time.Duration
}

// NewAnnasArchive wires an AnnasArchive provider. Each Lookup call
// gets a fresh context with the given timeout so that one slow mirror
// can't block the whole orchestration chain.
func NewAnnasArchive(userAgent string, timeout time.Duration) *AnnasArchiveProvider {
	return &AnnasArchiveProvider{
		inner:   annas.New(userAgent),
		timeout: timeout,
	}
}

// Name implements Provider.
func (a *AnnasArchiveProvider) Name() string { return "annas-archive" }

// Lookup implements Provider.
func (a *AnnasArchiveProvider) Lookup(isbn string) (*Metadata, error) {
	ctx, cancel := context.WithTimeout(context.Background(), a.timeout)
	defer cancel()

	info, err := a.inner.Lookup(ctx, isbn)
	if err != nil {
		// Map ErrTransient to a generic error for the orchestrator. The
		// service treats anything non-nil from the same source as
		// transient (no negative cache).
		if errors.Is(err, annas.ErrTransient) {
			return nil, err
		}
		return nil, err
	}
	if info == nil {
		return nil, nil
	}
	return &Metadata{
		Title:           info.Title,
		Subtitle:        info.Subtitle,
		Authors:         info.Authors,
		Publisher:       info.Publisher,
		PublishYear:     info.PublishYear,
		PageCount:       info.PageCount,
		Language:        info.Language,
		Description:     info.Description,
		ISBN10:          info.ISBN10,
		ISBN13:          info.ISBN13,
		CoverURL:        info.CoverURL,
		CoverCandidates: nonEmpty(info.CoverURL),
		SourceURL:       info.SourceURL,
	}, nil
}

func nonEmpty(s string) []string {
	if s == "" {
		return nil
	}
	return []string{s}
}
