package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/bookeeper/bookeeper-neo/server/internal/mw"
)

// StatHandlers espone una dashboard analitica della libreria familiare.
//
// Tutto è derivato dai dati esistenti (books, shelves, wishlist, loans):
// non c'è una tabella reading-log dedicata, quindi le metriche temporali
// usano `books.created_at` come proxy di "aggiunta in libreria" e
// `loans.lent_at` / `loans.returned_at` per l'attività di prestito.
//
// Un singolo endpoint `GET /api/v1/stats` restituisce un payload completo
// per evitare N round-trip dalla UI dashboard.
type StatHandlers struct {
	DB *sql.DB
}

type statsResp struct {
	Overview        statsOverview   `json:"overview"`
	ByFormat        []statsKV       `json:"by_format"`
	ByLanguage      []statsKV       `json:"by_language"`
	ByGenre         []statsKV       `json:"by_genre"`
	ByDecade        []statsKV       `json:"by_decade"`
	AdditionsByMonth []statsMonth   `json:"additions_by_month"`
	LoansByMonth    []statsLoanMonth `json:"loans_by_month"`
	TopAuthors      []statsKV       `json:"top_authors"`
	ShelfFill       []statsShelfFill `json:"shelf_fill"`
}

type statsOverview struct {
	TotalBooks    int `json:"total_books"`
	TotalAuthors  int `json:"total_authors"`
	TotalShelves  int `json:"total_shelves"`
	TotalPages    int `json:"total_pages"`
	WishlistCount int `json:"wishlist_count"`
	ActiveLoans   int `json:"active_loans"`
	OverdueLoans  int `json:"overdue_loans"`
	ReturnedLoans int `json:"returned_loans"`
}

type statsKV struct {
	Key   string `json:"key"`
	Count int    `json:"count"`
}

type statsMonth struct {
	YM    string `json:"ym"` // "YYYY-MM"
	Count int    `json:"count"`
}

type statsLoanMonth struct {
	YM       string `json:"ym"`
	Lent     int    `json:"lent"`
	Returned int    `json:"returned"`
}

type statsShelfFill struct {
	ID       string  `json:"id"`
	Name     string  `json:"name"`
	Color    string  `json:"color"`
	Capacity int     `json:"capacity"`
	Used     int     `json:"used"`
	Pct      float64 `json:"pct"`
}

// Get aggrega tutte le metriche in un solo handler.
// Tempo: ~5-8 query, tutte filtrate per tenant_id, su SQLite locale → ms.
func (h *StatHandlers) Get(w http.ResponseWriter, r *http.Request) {
	id, ok := mw.FromContext(r.Context())
	if !ok {
		writeErr(w, http.StatusUnauthorized, "no identity")
		return
	}
	ctx := r.Context()
	tenant := id.TenantID
	now := time.Now().Unix()

	out := statsResp{
		ByFormat:         []statsKV{},
		ByLanguage:       []statsKV{},
		ByGenre:          []statsKV{},
		ByDecade:         []statsKV{},
		AdditionsByMonth: []statsMonth{},
		LoansByMonth:     []statsLoanMonth{},
		TopAuthors:       []statsKV{},
		ShelfFill:        []statsShelfFill{},
	}

	// --- Overview: counts diretti (singola query con sub-select).
	if err := h.DB.QueryRowContext(ctx, `
		SELECT
			(SELECT COUNT(*)        FROM books    WHERE tenant_id = ?),
			(SELECT COUNT(*)        FROM shelves  WHERE tenant_id = ?),
			(SELECT COALESCE(SUM(page_count), 0) FROM books WHERE tenant_id = ? AND page_count IS NOT NULL),
			(SELECT COUNT(*)        FROM wishlist WHERE tenant_id = ?),
			(SELECT COUNT(*)        FROM loans    WHERE tenant_id = ? AND returned_at IS NULL AND (due_at IS NULL OR due_at >= ?)),
			(SELECT COUNT(*)        FROM loans    WHERE tenant_id = ? AND returned_at IS NULL AND due_at IS NOT NULL AND due_at < ?),
			(SELECT COUNT(*)        FROM loans    WHERE tenant_id = ? AND returned_at IS NOT NULL)
	`, tenant, tenant, tenant, tenant, tenant, now, tenant, now, tenant).Scan(
		&out.Overview.TotalBooks,
		&out.Overview.TotalShelves,
		&out.Overview.TotalPages,
		&out.Overview.WishlistCount,
		&out.Overview.ActiveLoans,
		&out.Overview.OverdueLoans,
		&out.Overview.ReturnedLoans,
	); err != nil {
		writeErr(w, http.StatusInternalServerError, "db error: "+err.Error())
		return
	}

	// --- By format / language / decade (raggruppamenti puri SQL).
	out.ByFormat, _ = scanKV(ctx, h.DB, `
		SELECT COALESCE(NULLIF(TRIM(format), ''), 'sconosciuto') AS k, COUNT(*) AS n
		  FROM books WHERE tenant_id = ?
		 GROUP BY k ORDER BY n DESC, k ASC
	`, tenant)

	out.ByLanguage, _ = scanKV(ctx, h.DB, `
		SELECT COALESCE(NULLIF(TRIM(language), ''), 'sconosciuto') AS k, COUNT(*) AS n
		  FROM books WHERE tenant_id = ?
		 GROUP BY k ORDER BY n DESC, k ASC
	`, tenant)

	// Genre: COUNT only sui valori effettivamente impostati. Limite top 12 per
	// non saturare il chart su librerie con tassonomia ampia.
	out.ByGenre, _ = scanKV(ctx, h.DB, `
		SELECT TRIM(genre) AS k, COUNT(*) AS n
		  FROM books WHERE tenant_id = ?
		   AND genre IS NOT NULL AND TRIM(genre) <> ''
		 GROUP BY k ORDER BY n DESC, k ASC
		 LIMIT 12
	`, tenant)

	out.ByDecade, _ = scanKV(ctx, h.DB, `
		SELECT CASE
		         WHEN published_year IS NULL OR published_year < 1500 THEN 'sconosciuta'
		         ELSE CAST((published_year / 10) * 10 AS TEXT) || 's'
		       END AS k,
		       COUNT(*) AS n
		  FROM books WHERE tenant_id = ?
		 GROUP BY k ORDER BY k ASC
	`, tenant)

	// --- Additions by month (ultimi 12 mesi inclusi quelli a zero).
	out.AdditionsByMonth = lastMonthsSeries(now, 12)
	rows, err := h.DB.QueryContext(ctx, `
		SELECT strftime('%Y-%m', datetime(created_at, 'unixepoch')) AS ym, COUNT(*)
		  FROM books WHERE tenant_id = ?
		   AND created_at >= ?
		 GROUP BY ym
	`, tenant, monthsAgoUnix(now, 12))
	if err == nil {
		mapByYM := map[string]int{}
		for rows.Next() {
			var ym string
			var n int
			if err := rows.Scan(&ym, &n); err == nil {
				mapByYM[ym] = n
			}
		}
		_ = rows.Close()
		for i := range out.AdditionsByMonth {
			out.AdditionsByMonth[i].Count = mapByYM[out.AdditionsByMonth[i].YM]
		}
	}

	// --- Loans by month: due serie sulla stessa griglia mensile.
	out.LoansByMonth = make([]statsLoanMonth, 12)
	base := lastMonthsSeries(now, 12)
	for i, b := range base {
		out.LoansByMonth[i] = statsLoanMonth{YM: b.YM}
	}
	if rows2, err := h.DB.QueryContext(ctx, `
		SELECT strftime('%Y-%m', datetime(lent_at, 'unixepoch')) AS ym, COUNT(*)
		  FROM loans WHERE tenant_id = ? AND lent_at >= ?
		 GROUP BY ym
	`, tenant, monthsAgoUnix(now, 12)); err == nil {
		m := map[string]int{}
		for rows2.Next() {
			var ym string
			var n int
			if err := rows2.Scan(&ym, &n); err == nil {
				m[ym] = n
			}
		}
		_ = rows2.Close()
		for i := range out.LoansByMonth {
			out.LoansByMonth[i].Lent = m[out.LoansByMonth[i].YM]
		}
	}
	if rows3, err := h.DB.QueryContext(ctx, `
		SELECT strftime('%Y-%m', datetime(returned_at, 'unixepoch')) AS ym, COUNT(*)
		  FROM loans WHERE tenant_id = ? AND returned_at IS NOT NULL AND returned_at >= ?
		 GROUP BY ym
	`, tenant, monthsAgoUnix(now, 12)); err == nil {
		m := map[string]int{}
		for rows3.Next() {
			var ym string
			var n int
			if err := rows3.Scan(&ym, &n); err == nil {
				m[ym] = n
			}
		}
		_ = rows3.Close()
		for i := range out.LoansByMonth {
			out.LoansByMonth[i].Returned = m[out.LoansByMonth[i].YM]
		}
	}

	// --- Top authors: parse JSON in Go (authors_json non è facilmente
	// "smontabile" senza json_each, che richiede l'estensione json1 sempre
	// abilitata in mod_sqlite ma vogliamo restare portabili).
	authorsCount := map[string]int{}
	totalAuthors := map[string]struct{}{}
	if rows4, err := h.DB.QueryContext(ctx,
		`SELECT authors_json FROM books WHERE tenant_id = ?`, tenant); err == nil {
		for rows4.Next() {
			var raw string
			if err := rows4.Scan(&raw); err != nil {
				continue
			}
			var arr []string
			if err := json.Unmarshal([]byte(raw), &arr); err != nil {
				continue
			}
			for _, a := range arr {
				name := strings.TrimSpace(a)
				if name == "" {
					continue
				}
				authorsCount[name]++
				totalAuthors[name] = struct{}{}
			}
		}
		_ = rows4.Close()
	}
	out.Overview.TotalAuthors = len(totalAuthors)
	out.TopAuthors = topNFromMap(authorsCount, 10)

	// --- Shelf fill: capacity = rows*slots_per_row, used = libri con
	// location_shelf = nome dello scaffale (best-effort; manca FK reale).
	if rows5, err := h.DB.QueryContext(ctx, `
		SELECT s.id, s.name, COALESCE(s.color, 'sage'),
		       (s.rows * s.slots_per_row) AS capacity,
		       COALESCE((SELECT COUNT(*) FROM books b
		                  WHERE b.tenant_id = s.tenant_id
		                    AND b.location_shelf = s.id), 0) AS used
		  FROM shelves s
		 WHERE s.tenant_id = ?
		 ORDER BY s.name ASC
	`, tenant); err == nil {
		for rows5.Next() {
			var sf statsShelfFill
			if err := rows5.Scan(&sf.ID, &sf.Name, &sf.Color, &sf.Capacity, &sf.Used); err == nil {
				if sf.Capacity > 0 {
					sf.Pct = float64(sf.Used) / float64(sf.Capacity)
				}
				out.ShelfFill = append(out.ShelfFill, sf)
			}
		}
		_ = rows5.Close()
	}

	writeJSON(w, http.StatusOK, out)
}

// --- helpers ---

func scanKV(ctx context.Context, db *sql.DB, q string, args ...interface{}) ([]statsKV, error) {
	out := []statsKV{}
	rows, err := db.QueryContext(ctx, q, args...)
	if err != nil {
		return out, err
	}
	defer rows.Close()
	for rows.Next() {
		var kv statsKV
		if err := rows.Scan(&kv.Key, &kv.Count); err != nil {
			return out, err
		}
		out = append(out, kv)
	}
	return out, nil
}

// monthsAgoUnix ritorna l'epoch (secondi) di N mesi fa, normalizzato
// all'inizio del mese in UTC, così il filtro WHERE include tutto il mese.
func monthsAgoUnix(now int64, n int) int64 {
	t := time.Unix(now, 0).UTC()
	first := time.Date(t.Year(), t.Month(), 1, 0, 0, 0, 0, time.UTC)
	first = first.AddDate(0, -(n - 1), 0)
	return first.Unix()
}

// lastMonthsSeries genera la lista degli ultimi N mesi in formato YYYY-MM,
// dal più vecchio al più recente, così la UI può fare line-chart cronologici
// senza preoccuparsi di "buchi" nei mesi a zero.
func lastMonthsSeries(now int64, n int) []statsMonth {
	t := time.Unix(now, 0).UTC()
	first := time.Date(t.Year(), t.Month(), 1, 0, 0, 0, 0, time.UTC)
	out := make([]statsMonth, n)
	for i := 0; i < n; i++ {
		m := first.AddDate(0, -(n - 1 - i), 0)
		out[i] = statsMonth{YM: m.Format("2006-01")}
	}
	return out
}

// topNFromMap ordina la mappa per count desc (tie-break alfabetico) e
// restituisce le prime N voci.
func topNFromMap(m map[string]int, n int) []statsKV {
	all := make([]statsKV, 0, len(m))
	for k, v := range m {
		all = append(all, statsKV{Key: k, Count: v})
	}
	sort.Slice(all, func(i, j int) bool {
		if all[i].Count != all[j].Count {
			return all[i].Count > all[j].Count
		}
		return all[i].Key < all[j].Key
	})
	if len(all) > n {
		all = all[:n]
	}
	return all
}
