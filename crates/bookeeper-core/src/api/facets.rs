use std::collections::HashMap;

use axum::{extract::State, routing::get, Json};
use rusqlite::{params, Connection};
use serde::Serialize;
use utoipa::ToSchema;

use crate::{
    auth::guard::AuthUser,
    error::{ApiErrorBody, ApiResult},
    state::AppState,
};

pub fn routes() -> axum::Router<AppState> {
    axum::Router::new().route("/api/v1/books/facets", get(facets))
}

#[derive(utoipa::OpenApi)]
#[openapi(
    paths(facets),
    components(schemas(
        Facets,
        ValueCount,
        YearRange,
        TagFacet,
        NamedFacet,
        ReadingFacet,
        OwnerFacet
    ))
)]
pub struct Doc;

/// Most entries of the genre and language facets.
const MAX_ENTRIES: usize = 200;

#[derive(Debug, Serialize, ToSchema)]
pub struct ValueCount {
    pub value: String,
    pub count: i64,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct YearRange {
    pub min: Option<i64>,
    pub max: Option<i64>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct TagFacet {
    pub id: String,
    pub name: String,
    pub color: String,
    pub count: i64,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct NamedFacet {
    pub id: String,
    pub name: String,
    pub count: i64,
}

/// Books of the library by the caller's reading state.
#[derive(Debug, Serialize, ToSchema)]
pub struct ReadingFacet {
    pub to_read: i64,
    pub reading: i64,
    pub read: i64,
    pub abandoned: i64,
    /// Books without a state for the caller.
    pub none: i64,
}

/// Counts over the whole library, whatever filter a list is using.
#[derive(Debug, Serialize, ToSchema)]
pub struct Facets {
    /// Grouped ignoring Unicode case, showing the most frequent spelling; at most 200.
    pub genres: Vec<ValueCount>,
    /// Same rules as `genres`.
    pub languages: Vec<ValueCount>,
    pub formats: Vec<ValueCount>,
    pub years: YearRange,
    pub tags: Vec<TagFacet>,
    pub rooms: Vec<NamedFacet>,
    pub shelves: Vec<NamedFacet>,
    pub reading: ReadingFacet,
    /// People who own at least one book, most books first, then by name.
    pub owners: Vec<OwnerFacet>,
    /// Books without an owner.
    pub owner_none: i64,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct OwnerFacet {
    pub id: String,
    pub display_name: String,
    pub count: i64,
}

/// Groups a column by its lowercase form (the same one `genre` and `language`
/// filters compare), keeping the most frequent spelling of each group.
fn grouped(
    conn: &Connection,
    library_id: &str,
    col: &'static str,
) -> rusqlite::Result<Vec<ValueCount>> {
    // `col` is one of two fixed column names.
    let mut stmt = conn.prepare(&format!(
        "SELECT {col}, COUNT(*) FROM books \
         WHERE library_id = ?1 AND {col} IS NOT NULL AND {col} <> '' GROUP BY {col}"
    ))?;
    let rows = stmt
        .query_map(params![library_id], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    // key -> (total, best spelling, its count)
    let mut groups: HashMap<String, (i64, String, i64)> = HashMap::new();
    for (value, count) in rows {
        let e = groups
            .entry(value.to_lowercase())
            .or_insert((0, value.clone(), 0));
        e.0 += count;
        if count > e.2 || (count == e.2 && value < e.1) {
            e.1 = value;
            e.2 = count;
        }
    }
    let mut out: Vec<ValueCount> = groups
        .into_values()
        .map(|(count, value, _)| ValueCount { value, count })
        .collect();
    out.sort_by(|a, b| b.count.cmp(&a.count).then_with(|| a.value.cmp(&b.value)));
    out.truncate(MAX_ENTRIES);
    Ok(out)
}

#[utoipa::path(
    get,
    path = "/api/v1/books/facets",
    tag = "books",
    security(("bearer" = [])),
    responses(
        (status = 200, description = "Counts over the whole library", body = Facets),
        (status = 401, description = "unauthorized, token_expired or device_revoked", body = ApiErrorBody),
    )
)]
pub async fn facets(State(state): State<AppState>, who: AuthUser) -> ApiResult<Json<Facets>> {
    let out = state
        .db
        .run(move |conn| {
            let lib = who.library_id.as_str();
            let genres = grouped(conn, lib, "genre")?;
            let languages = grouped(conn, lib, "language")?;

            let formats = conn
                .prepare(
                    "SELECT format, COUNT(*) AS n FROM books \
                     WHERE library_id = ?1 AND format IS NOT NULL \
                     GROUP BY format ORDER BY n DESC, format",
                )?
                .query_map(params![lib], |r| {
                    Ok(ValueCount {
                        value: r.get(0)?,
                        count: r.get(1)?,
                    })
                })?
                .collect::<rusqlite::Result<Vec<_>>>()?;

            let years = conn.query_row(
                "SELECT MIN(published_year), MAX(published_year) FROM books WHERE library_id = ?1",
                params![lib],
                |r| {
                    Ok(YearRange {
                        min: r.get(0)?,
                        max: r.get(1)?,
                    })
                },
            )?;

            let tags = conn
                .prepare(TAGS_SQL)?
                .query_map(params![lib], |r| {
                    Ok(TagFacet {
                        id: r.get(0)?,
                        name: r.get(1)?,
                        color: r.get(2)?,
                        count: r.get(3)?,
                    })
                })?
                .collect::<rusqlite::Result<Vec<_>>>()?;

            let named = |sql: &str| -> rusqlite::Result<Vec<NamedFacet>> {
                conn.prepare(sql)?
                    .query_map(params![lib], |r| {
                        Ok(NamedFacet {
                            id: r.get(0)?,
                            name: r.get(1)?,
                            count: r.get(2)?,
                        })
                    })?
                    .collect()
            };
            let rooms = named(ROOMS_SQL)?;
            let shelves = named(SHELVES_SQL)?;

            let total: i64 = conn.query_row(
                "SELECT COUNT(*) FROM books WHERE library_id = ?1",
                params![lib],
                |r| r.get(0),
            )?;
            let mut reading = ReadingFacet {
                to_read: 0,
                reading: 0,
                read: 0,
                abandoned: 0,
                none: 0,
            };
            let mut stmt = conn.prepare(READING_SQL)?;
            let rows = stmt
                .query_map(params![lib, who.user_id], |r| {
                    Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?))
                })?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            let mut with_state = 0;
            for (status, n) in rows {
                with_state += n;
                match status.as_str() {
                    "to_read" => reading.to_read = n,
                    "reading" => reading.reading = n,
                    "read" => reading.read = n,
                    _ => reading.abandoned = n,
                }
            }
            reading.none = total - with_state;

            let owners = conn
                .prepare(OWNERS_SQL)?
                .query_map(params![lib], |r| {
                    Ok(OwnerFacet {
                        id: r.get(0)?,
                        display_name: r.get(1)?,
                        count: r.get(2)?,
                    })
                })?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            let owner_none: i64 = conn.query_row(
                "SELECT COUNT(*) FROM books WHERE library_id = ?1 AND owner_user_id IS NULL",
                params![lib],
                |r| r.get(0),
            )?;

            Ok(Facets {
                genres,
                languages,
                formats,
                years,
                tags,
                rooms,
                shelves,
                reading,
                owners,
                owner_none,
            })
        })
        .await?;
    Ok(Json(out))
}

// The join queries of the facets, public (hidden) so the plan test can check them.
// `CROSS JOIN` pins the join order: with the extra indexes on `books` SQLite would
// otherwise start from a full scan of `books`.
#[doc(hidden)]
pub const TAGS_SQL: &str = "SELECT t.id, t.name, t.color, COUNT(*) AS n FROM tags t \
     CROSS JOIN book_tags bt ON bt.tag_id = t.id \
     CROSS JOIN books b ON b.id = bt.book_id AND b.library_id = t.library_id \
     WHERE t.library_id = ?1 GROUP BY t.id ORDER BY n DESC, t.name, t.id";
#[doc(hidden)]
pub const ROOMS_SQL: &str = "SELECT r.id, r.name, COUNT(*) AS n FROM rooms r \
     JOIN shelves s ON s.room_id = r.id \
     JOIN shelf_books sb ON sb.shelf_id = s.id \
     JOIN books b ON b.id = sb.book_id AND b.library_id = r.library_id \
     WHERE r.library_id = ?1 GROUP BY r.id ORDER BY n DESC, r.name, r.id";
#[doc(hidden)]
pub const SHELVES_SQL: &str = "SELECT s.id, s.name, COUNT(*) AS n FROM shelves s \
     JOIN shelf_books sb ON sb.shelf_id = s.id \
     JOIN books b ON b.id = sb.book_id AND b.library_id = s.library_id \
     WHERE s.library_id = ?1 GROUP BY s.id ORDER BY n DESC, s.name, s.id";
/// Takes `?1` library and `?2` user.
#[doc(hidden)]
pub const READING_SQL: &str = "SELECT rd.status, COUNT(*) FROM reading rd \
     JOIN books b ON b.id = rd.book_id \
     WHERE b.library_id = ?1 AND rd.user_id = ?2 GROUP BY rd.status";
#[doc(hidden)]
pub const OWNERS_SQL: &str = "SELECT u.id, u.display_name, COUNT(*) AS n FROM users u \
     JOIN books b ON b.owner_user_id = u.id AND b.library_id = u.library_id \
     WHERE u.library_id = ?1 \
     GROUP BY u.id ORDER BY n DESC, u.display_name COLLATE NOCASE, u.id";
