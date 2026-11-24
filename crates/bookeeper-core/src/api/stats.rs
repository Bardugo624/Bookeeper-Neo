use std::collections::{HashMap, HashSet};

use axum::{extract::State, routing::get, Json};
use chrono::{Datelike, TimeZone, Utc};
use rusqlite::{params, Connection};
use serde::Serialize;
use utoipa::ToSchema;

use crate::{
    api::util::now_secs,
    auth::guard::AuthUser,
    error::{ApiErrorBody, ApiResult},
    state::AppState,
};

pub fn routes() -> axum::Router<AppState> {
    axum::Router::new().route("/api/v1/stats", get(get_stats))
}

#[derive(utoipa::OpenApi)]
#[openapi(
    paths(get_stats),
    components(schemas(Stats, Overview, CountBy, MonthCount, LoanMonth, ShelfFill))
)]
pub struct Doc;

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct Overview {
    pub total_books: i64,
    pub total_authors: i64,
    pub total_shelves: i64,
    pub total_pages: i64,
    pub wishlist_count: i64,
    pub active_loans: i64,
    pub overdue_loans: i64,
    pub returned_loans: i64,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct CountBy {
    pub key: String,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct MonthCount {
    /// `YYYY-MM`, UTC.
    pub ym: String,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct LoanMonth {
    /// `YYYY-MM`, UTC.
    pub ym: String,
    pub lent: i64,
    pub returned: i64,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct ShelfFill {
    pub id: String,
    pub name: String,
    pub color: String,
    pub capacity: i64,
    pub used: i64,
    /// `used / capacity`, 0 to 1, rounded to 4 decimals.
    pub pct: f64,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct Stats {
    pub overview: Overview,
    pub by_format: Vec<CountBy>,
    pub by_language: Vec<CountBy>,
    pub by_genre: Vec<CountBy>,
    pub by_decade: Vec<CountBy>,
    pub additions_by_month: Vec<MonthCount>,
    pub loans_by_month: Vec<LoanMonth>,
    pub top_authors: Vec<CountBy>,
    pub shelf_fill: Vec<ShelfFill>,
}

#[utoipa::path(
    get,
    path = "/api/v1/stats",
    tag = "stats",
    security(("bearer" = [])),
    responses(
        (status = 200, description = "Library statistics", body = Stats),
        (status = 401, description = "unauthorized, token_expired or device_revoked", body = ApiErrorBody),
    )
)]
pub async fn get_stats(State(state): State<AppState>, who: AuthUser) -> ApiResult<Json<Stats>> {
    let now = now_secs();
    let out = state.db.run(move |conn| compute(conn, &who, now)).await?;
    Ok(Json(out))
}

/// The twelve calendar months (UTC) ending with the one containing `now`:
/// `(labels oldest first, first second of the oldest month)`.
fn last_twelve_months(now: i64) -> (Vec<String>, i64) {
    let dt = Utc.timestamp_opt(now, 0).single().unwrap_or_default();
    let start_idx = dt.year() * 12 + dt.month0() as i32 - 11;
    let labels = (start_idx..start_idx + 12)
        .map(|i| format!("{:04}-{:02}", i.div_euclid(12), i.rem_euclid(12) + 1))
        .collect();
    let start = Utc
        .with_ymd_and_hms(
            start_idx.div_euclid(12),
            (start_idx.rem_euclid(12) + 1) as u32,
            1,
            0,
            0,
            0,
        )
        .single()
        .map_or(0, |d| d.timestamp());
    (labels, start)
}

fn group_counts(
    conn: &Connection,
    sql: &str,
    lib: &str,
    start: i64,
) -> rusqlite::Result<HashMap<String, i64>> {
    let mut stmt = conn.prepare(sql)?;
    let rows = stmt.query_map(params![lib, start], |r| {
        Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?))
    })?;
    rows.collect()
}

/// Count per value: most frequent first, ties by key, the empty key always last.
fn by_value(conn: &Connection, col: &str, lib: &str) -> rusqlite::Result<Vec<CountBy>> {
    let sql = format!(
        "SELECT COALESCE(NULLIF(TRIM({col}), ''), '') AS k, COUNT(*) FROM books
         WHERE library_id = ?1 GROUP BY k
         ORDER BY k = '', COUNT(*) DESC, k"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([lib], |r| {
        Ok(CountBy {
            key: r.get(0)?,
            count: r.get(1)?,
        })
    })?;
    rows.collect()
}

pub fn compute(conn: &Connection, who: &AuthUser, now: i64) -> rusqlite::Result<Stats> {
    let lib = who.library_id.as_str();

    // Overview: books, pages, shelves, wishlist and loans in a single row.
    let (total_books, total_pages, total_shelves, wishlist_count, active, overdue, returned) = conn
        .query_row(
            "SELECT
               (SELECT COUNT(*) FROM books WHERE library_id = ?1),
               (SELECT COALESCE(SUM(COALESCE(page_count, 0)), 0) FROM books WHERE library_id = ?1),
               (SELECT COUNT(*) FROM shelves WHERE library_id = ?1),
               (SELECT COUNT(*) FROM wishlist WHERE library_id = ?1 AND user_id = ?2),
               (SELECT COUNT(*) FROM loans WHERE library_id = ?1 AND returned_at IS NULL),
               (SELECT COUNT(*) FROM loans WHERE library_id = ?1 AND returned_at IS NULL
                  AND due_at IS NOT NULL AND due_at < ?3),
               (SELECT COUNT(*) FROM loans WHERE library_id = ?1 AND returned_at IS NOT NULL)",
            params![lib, who.user_id, now],
            |r| {
                Ok((
                    r.get::<_, i64>(0)?,
                    r.get::<_, i64>(1)?,
                    r.get::<_, i64>(2)?,
                    r.get::<_, i64>(3)?,
                    r.get::<_, i64>(4)?,
                    r.get::<_, i64>(5)?,
                    r.get::<_, i64>(6)?,
                ))
            },
        )?;

    // Authors: one row per (book, spelling), folded case-insensitively; each
    // author counts the distinct books that list them.
    let mut author_map: HashMap<String, (HashSet<String>, HashMap<String, i64>)> = HashMap::new();
    {
        let mut stmt = conn.prepare(
            "SELECT DISTINCT b.id, TRIM(j.value) AS a
             FROM books b, json_each(b.authors_json) j
             WHERE b.library_id = ?1 AND j.type = 'text' AND TRIM(j.value) <> ''",
        )?;
        let rows = stmt.query_map([lib], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
        })?;
        for row in rows {
            let (book, name) = row?;
            let entry = author_map.entry(name.to_lowercase()).or_default();
            // A spelling also gets a vote when the book was already counted.
            entry.0.insert(book);
            *entry.1.entry(name).or_default() += 1;
        }
    }
    let total_authors = author_map.len() as i64;
    let mut top_authors: Vec<CountBy> = author_map
        .into_values()
        .map(|(books, spellings)| {
            let count = books.len() as i64;
            let key = spellings
                .into_iter()
                .max_by(|a, b| a.1.cmp(&b.1).then_with(|| b.0.cmp(&a.0)))
                .map(|(k, _)| k)
                .unwrap_or_default();
            CountBy { key, count }
        })
        .collect();
    top_authors.sort_by(|a, b| b.count.cmp(&a.count).then_with(|| a.key.cmp(&b.key)));
    top_authors.truncate(10);

    let by_format = by_value(conn, "format", lib)?;
    let by_language = by_value(conn, "language", lib)?;

    let mut by_genre = by_value(conn, "genre", lib)?;
    let missing = match by_genre.last() {
        Some(last) if last.key.is_empty() => by_genre.pop(),
        _ => None,
    };
    if by_genre.len() > 20 {
        let rest: i64 = by_genre.drain(20..).map(|c| c.count).sum();
        by_genre.push(CountBy {
            key: "…".into(),
            count: rest,
        });
    }
    by_genre.extend(missing);

    let by_decade = {
        let mut stmt = conn.prepare(
            "SELECT (published_year / 10) * 10 AS d, COUNT(*) FROM books
             WHERE library_id = ?1 AND published_year IS NOT NULL GROUP BY d ORDER BY d",
        )?;
        let rows = stmt.query_map([lib], |r| {
            Ok(CountBy {
                key: r.get::<_, i64>(0)?.to_string(),
                count: r.get(1)?,
            })
        })?;
        rows.collect::<rusqlite::Result<Vec<_>>>()?
    };

    let (months, start) = last_twelve_months(now);
    let added = group_counts(
        conn,
        "SELECT strftime('%Y-%m', created_at, 'unixepoch') AS m, COUNT(*) FROM books
         WHERE library_id = ?1 AND created_at >= ?2 GROUP BY m",
        lib,
        start,
    )?;
    let lent = group_counts(
        conn,
        "SELECT strftime('%Y-%m', lent_at, 'unixepoch') AS m, COUNT(*) FROM loans
         WHERE library_id = ?1 AND lent_at >= ?2 GROUP BY m",
        lib,
        start,
    )?;
    let back = group_counts(
        conn,
        "SELECT strftime('%Y-%m', returned_at, 'unixepoch') AS m, COUNT(*) FROM loans
         WHERE library_id = ?1 AND returned_at IS NOT NULL AND returned_at >= ?2 GROUP BY m",
        lib,
        start,
    )?;
    let additions_by_month = months
        .iter()
        .map(|m| MonthCount {
            ym: m.clone(),
            count: added.get(m).copied().unwrap_or(0),
        })
        .collect();
    let loans_by_month = months
        .iter()
        .map(|m| LoanMonth {
            ym: m.clone(),
            lent: lent.get(m).copied().unwrap_or(0),
            returned: back.get(m).copied().unwrap_or(0),
        })
        .collect();

    let shelf_fill = {
        let mut stmt = conn.prepare(
            "SELECT s.id, s.name, s.color, s.rows * s.slots_per_row,
                    (SELECT COUNT(*) FROM shelf_books sb WHERE sb.shelf_id = s.id)
             FROM shelves s WHERE s.library_id = ?1 ORDER BY s.label_code",
        )?;
        let rows = stmt.query_map([lib], |r| {
            let capacity: i64 = r.get(3)?;
            let used: i64 = r.get(4)?;
            let pct = if capacity > 0 {
                ((used as f64 / capacity as f64) * 10_000.0).round() / 10_000.0
            } else {
                0.0
            };
            Ok(ShelfFill {
                id: r.get(0)?,
                name: r.get(1)?,
                color: r.get(2)?,
                capacity,
                used,
                pct,
            })
        })?;
        rows.collect::<rusqlite::Result<Vec<_>>>()?
    };

    Ok(Stats {
        overview: Overview {
            total_books,
            total_authors,
            total_shelves,
            total_pages,
            wishlist_count,
            active_loans: active,
            overdue_loans: overdue,
            returned_loans: returned,
        },
        by_format,
        by_language,
        by_genre,
        by_decade,
        additions_by_month,
        loans_by_month,
        top_authors,
        shelf_fill,
    })
}
