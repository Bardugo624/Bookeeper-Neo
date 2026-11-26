use axum::{extract::State, routing::get, Json};
use rusqlite::types::Value;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::{
    api::books::{map_book, BookOut, SELECT_BOOK},
    api::util::{ApiQuery, Page},
    api::{reading::attach_reading, tags::attach_tags},
    auth::guard::AuthUser,
    error::{ApiError, ApiErrorBody, ApiResult},
    state::AppState,
};

pub fn routes() -> axum::Router<AppState> {
    axum::Router::new().route("/api/v1/books", get(list_books))
}

#[derive(utoipa::OpenApi)]
#[openapi(paths(list_books), components(schemas(BookList, ListBooksQuery)))]
pub struct Doc;

#[derive(Debug, Serialize, ToSchema)]
pub struct BookList {
    pub items: Vec<BookOut>,
    /// Count with the same filters, ignoring `limit` and `offset`.
    pub total: i64,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct ListBooksQuery {
    /// Full-text search over title, subtitle, authors, description, notes and ISBN.
    pub q: Option<String>,
    /// Case-insensitive match.
    pub genre: Option<String>,
    /// Case-insensitive match.
    pub language: Option<String>,
    /// `hardcover`, `paperback`, `ebook` or `audiobook`.
    pub format: Option<String>,
    pub shelf_id: Option<String>,
    /// `true`: only books without a placement.
    pub unshelved: Option<String>,
    /// `true`: only books with an open loan; `false`: only the others.
    pub on_loan: Option<String>,
    /// The caller's reading state: `to_read`, `reading`, `read`, `abandoned` or
    /// `none` (no state).
    pub reading: Option<String>,
    /// Books placed on a shelf of this room.
    pub room_id: Option<String>,
    /// Books of this owner: a person id, `me` or `none` (no owner).
    pub owner_id: Option<String>,
    /// Lowest `published_year`, inclusive.
    pub year_from: Option<i64>,
    /// Highest `published_year`, inclusive.
    pub year_to: Option<i64>,
    /// Lowest `acquired_at` (unix seconds), inclusive.
    pub acquired_from: Option<i64>,
    /// Highest `acquired_at` (unix seconds), inclusive.
    pub acquired_to: Option<i64>,
    /// `created_at` (default), `title`, `author`, `year`, `published_year`,
    /// `acquired_at`, `page_count`, `progressive`, `progressive_number` or `rating`.
    pub sort: Option<String>,
    /// `asc` or `desc`; default `desc` for `created_at`, `asc` otherwise.
    pub order: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

const FROM_BOOKS: &str = "FROM books b \
    LEFT JOIN shelf_books sb ON sb.book_id = b.id \
    LEFT JOIN loans l ON l.book_id = b.id AND l.returned_at IS NULL";

const MAX_TAG_FILTERS: usize = 10;

const MAX_WORDS: usize = 16;

/// Turns free text into a safe FTS5 expression: every word is a quoted
/// string, the last one is a prefix. `None` when no word is left.
fn fts_expression(q: &str) -> Option<String> {
    use unicode_normalization::UnicodeNormalization;
    let q: String = q.nfc().collect();
    let words: Vec<&str> = q
        .split(|c: char| !c.is_alphanumeric())
        .filter(|w| !w.is_empty())
        .take(MAX_WORDS)
        .collect();
    if words.is_empty() {
        return None;
    }
    let last = words.len() - 1;
    let parts: Vec<String> = words
        .iter()
        .enumerate()
        .map(|(i, w)| {
            let quoted = format!("\"{}\"", w.replace('"', "\"\""));
            if i == last {
                format!("{quoted}*")
            } else {
                quoted
            }
        })
        .collect();
    Some(parts.join(" "))
}

fn parse_bool(name: &str, v: &Option<String>) -> ApiResult<Option<bool>> {
    match v.as_deref() {
        None => Ok(None),
        Some("true") => Ok(Some(true)),
        Some("false") => Ok(Some(false)),
        Some(_) => Err(ApiError::validation(format!(
            "{name} must be true or false"
        ))),
    }
}

/// Conditions, joins and bound values shared by the list and the count.
struct Filter {
    joins: String,
    conds: Vec<String>,
    args: Vec<Value>,
}

impl Filter {
    fn bind(&mut self, v: Value) -> usize {
        self.args.push(v);
        self.args.len()
    }
}

/// Reading state values accepted by `reading`.
const READING_VALUES: [&str; 5] = ["to_read", "reading", "read", "abandoned", "none"];

/// The single place that turns the query into SQL conditions. Only fixed
/// fragments are concatenated; every request value is bound.
fn build_filter(
    q: &ListBooksQuery,
    tag_ids: &[String],
    library_id: &str,
    user_id: &str,
) -> ApiResult<Filter> {
    if let Some(f) = q.format.as_deref() {
        if !["hardcover", "paperback", "ebook", "audiobook"].contains(&f) {
            return Err(ApiError::validation(
                "format must be hardcover, paperback, ebook or audiobook",
            ));
        }
    }
    if let Some(r) = q.reading.as_deref() {
        if !READING_VALUES.contains(&r) {
            return Err(ApiError::validation(
                "reading must be to_read, reading, read, abandoned or none",
            ));
        }
    }
    if let (Some(a), Some(b)) = (q.year_from, q.year_to) {
        if a > b {
            return Err(ApiError::validation("year_from must not exceed year_to"));
        }
    }
    if let (Some(a), Some(b)) = (q.acquired_from, q.acquired_to) {
        if a > b {
            return Err(ApiError::validation(
                "acquired_from must not exceed acquired_to",
            ));
        }
    }
    if tag_ids.len() > MAX_TAG_FILTERS {
        return Err(ApiError::validation("tag_id can be given at most 10 times"));
    }
    let unshelved = parse_bool("unshelved", &q.unshelved)? == Some(true);
    let on_loan = parse_bool("on_loan", &q.on_loan)?;
    if unshelved && q.shelf_id.is_some() {
        return Err(ApiError::validation(
            "shelf_id and unshelved=true cannot be combined",
        ));
    }

    let mut f = Filter {
        joins: String::new(),
        conds: vec!["b.library_id = ?1".to_string()],
        args: vec![Value::Text(library_id.to_string())],
    };
    if let Some(v) = &q.format {
        let n = f.bind(Value::Text(v.clone()));
        f.conds.push(format!("b.format = ?{n}"));
    }
    if let Some(v) = &q.shelf_id {
        let n = f.bind(Value::Text(v.clone()));
        f.conds.push(format!("sb.shelf_id = ?{n}"));
    }
    for (col, val) in [("b.genre", &q.genre), ("b.language", &q.language)] {
        if let Some(v) = val {
            let n = f.bind(Value::Text(v.to_lowercase()));
            f.conds.push(format!("ulower({col}) = ?{n}"));
        }
    }
    if unshelved {
        f.conds.push("sb.book_id IS NULL".to_string());
    }
    match on_loan {
        Some(true) => f.conds.push("l.id IS NOT NULL".to_string()),
        Some(false) => f.conds.push("l.id IS NULL".to_string()),
        None => {}
    }
    if let Some(v) = &q.room_id {
        let n = f.bind(Value::Text(v.clone()));
        f.conds.push(format!(
            "sb.shelf_id IN (SELECT s.id FROM shelves s WHERE s.room_id = ?{n})"
        ));
    }
    match q.owner_id.as_deref() {
        None => {}
        Some("none") => f.conds.push("b.owner_user_id IS NULL".to_string()),
        Some(v) => {
            let id = if v == "me" { user_id } else { v };
            let n = f.bind(Value::Text(id.to_string()));
            f.conds.push(format!("b.owner_user_id = ?{n}"));
        }
    }
    for id in tag_ids {
        let n = f.bind(Value::Text(id.clone()));
        f.conds.push(format!(
            "EXISTS (SELECT 1 FROM book_tags bt WHERE bt.book_id = b.id AND bt.tag_id = ?{n})"
        ));
    }
    for (col, op, val) in [
        ("b.published_year", ">=", q.year_from),
        ("b.published_year", "<=", q.year_to),
        ("b.acquired_at", ">=", q.acquired_from),
        ("b.acquired_at", "<=", q.acquired_to),
    ] {
        if let Some(v) = val {
            let n = f.bind(Value::Integer(v));
            f.conds.push(format!("{col} {op} ?{n}"));
        }
    }
    let rating_sort = q.sort.as_deref() == Some("rating");
    if q.reading.is_some() || rating_sort {
        let n = f.bind(Value::Text(user_id.to_string()));
        f.joins.push_str(&format!(
            " LEFT JOIN reading rd ON rd.book_id = b.id AND rd.user_id = ?{n}"
        ));
        match q.reading.as_deref() {
            Some("none") => f.conds.push("rd.book_id IS NULL".to_string()),
            Some(status) => {
                let n = f.bind(Value::Text(status.to_string()));
                f.conds.push(format!("rd.status = ?{n}"));
            }
            None => {}
        }
    }
    if let Some(expr) = q.q.as_deref().and_then(fts_expression) {
        let n = f.bind(Value::Text(expr));
        f.joins
            .push_str(" JOIN books_fts ON books_fts.rowid = b.rowid");
        f.conds.push(format!("books_fts MATCH ?{n}"));
    }
    Ok(f)
}

/// `ORDER BY` of a valid `sort`; column names come from this fixed table.
fn order_by(sort: Option<&str>, desc: bool, searching: bool) -> ApiResult<String> {
    let dir = if desc { "DESC" } else { "ASC" };
    let nullable = |col: &str| format!("{col} IS NULL, {col} {dir}, b.id {dir}");
    Ok(match sort {
        None if searching => "bm25(books_fts), b.created_at DESC, b.id DESC".to_string(),
        None | Some("created_at") => format!("b.created_at {dir}, b.id {dir}"),
        Some("title") => format!("b.title COLLATE NOCASE {dir}, b.id {dir}"),
        Some("author") => {
            let e = "json_extract(b.authors_json, '$[0]')";
            format!("{e} IS NULL, {e} COLLATE NOCASE {dir}, b.id {dir}")
        }
        Some("year" | "published_year") => nullable("b.published_year"),
        Some("acquired_at") => nullable("b.acquired_at"),
        Some("page_count") => nullable("b.page_count"),
        Some("progressive" | "progressive_number") => nullable("b.progressive_number"),
        Some("rating") => nullable("rd.rating"),
        Some(_) => {
            return Err(ApiError::validation(
                "sort must be created_at, title, author, year, published_year, acquired_at, \
                 page_count, progressive, progressive_number or rating",
            ))
        }
    })
}

/// The two statements of a list request and their bound values.
#[doc(hidden)]
pub struct ListSql {
    pub count: String,
    pub count_args: Vec<Value>,
    pub list: String,
    pub list_args: Vec<Value>,
}

/// Validates the query and builds the count and list statements.
#[doc(hidden)]
pub fn build_sql(
    q: &ListBooksQuery,
    tag_ids: &[String],
    library_id: &str,
    user_id: &str,
    limit: i64,
    offset: i64,
) -> ApiResult<ListSql> {
    let sort = q.sort.as_deref();
    let desc = match q.order.as_deref() {
        None => matches!(sort, None | Some("created_at")),
        Some("asc") => false,
        Some("desc") => true,
        Some(_) => return Err(ApiError::validation("order must be asc or desc")),
    };
    let filter = build_filter(q, tag_ids, library_id, user_id)?;
    let searching = filter.joins.contains("books_fts");
    if searching && sort.is_none() && q.order.is_some() {
        return Err(ApiError::validation(
            "order requires sort when searching with q",
        ));
    }
    let order = order_by(sort, desc, searching)?;
    let Filter { joins, conds, args } = filter;
    let where_ = format!("WHERE {}", conds.join(" AND "));
    let n = args.len();
    let mut list_args = args.clone();
    list_args.push(Value::Integer(limit));
    list_args.push(Value::Integer(offset));
    Ok(ListSql {
        count: format!("SELECT COUNT(*) {FROM_BOOKS}{joins} {where_}"),
        count_args: args,
        list: format!(
            "{SELECT_BOOK}{joins} {where_} ORDER BY {order} LIMIT ?{} OFFSET ?{}",
            n + 1,
            n + 2
        ),
        list_args,
    })
}

#[utoipa::path(
    get,
    path = "/api/v1/books",
    tag = "books",
    security(("bearer" = [])),
    params(
        ("q" = Option<String>, Query, description = "Full-text search; the last word matches by prefix"),
        ("genre" = Option<String>, Query, description = "Case-insensitive match"),
        ("language" = Option<String>, Query, description = "Case-insensitive match"),
        ("format" = Option<String>, Query, description = "hardcover, paperback, ebook or audiobook"),
        ("shelf_id" = Option<String>, Query, description = "Only books placed on this shelf"),
        ("unshelved" = Option<bool>, Query, description = "true: only books without a placement"),
        ("on_loan" = Option<bool>, Query, description = "true: open loan; false: no open loan"),
        ("reading" = Option<String>, Query, description = "Caller's state: to_read, reading, read, abandoned, or none for books without a state"),
        ("tag_id" = Option<Vec<String>>, Query, description = "Repeatable, at most 10: the book has all the given tags"),
        ("room_id" = Option<String>, Query, description = "Books placed on a shelf of this room"),
        ("owner_id" = Option<String>, Query, description = "Books of this owner: a person id, me, or none for books without an owner"),
        ("year_from" = Option<i64>, Query, description = "published_year >= value; must not exceed year_to"),
        ("year_to" = Option<i64>, Query, description = "published_year <= value"),
        ("acquired_from" = Option<i64>, Query, description = "acquired_at >= value (unix seconds); must not exceed acquired_to"),
        ("acquired_to" = Option<i64>, Query, description = "acquired_at <= value (unix seconds)"),
        ("sort" = Option<String>, Query, description = "created_at (default), title, author, year or published_year, acquired_at, page_count, progressive or progressive_number, rating (caller's); missing values come last"),
        ("order" = Option<String>, Query, description = "asc or desc"),
        ("limit" = Option<i64>, Query, description = "1 to 200, default 50"),
        ("offset" = Option<i64>, Query, description = "Default 0"),
    ),
    responses(
        (status = 200, description = "Books", body = BookList),
        (status = 401, description = "unauthorized, token_expired or device_revoked", body = ApiErrorBody),
        (status = 422, description = "validation: invalid query", body = ApiErrorBody),
    )
)]
pub async fn list_books(
    State(state): State<AppState>,
    who: AuthUser,
    ApiQuery(q): ApiQuery<ListBooksQuery>,
    ApiQuery(pairs): ApiQuery<Vec<(String, String)>>,
) -> ApiResult<Json<BookList>> {
    let (limit, offset) = Page {
        limit: q.limit,
        offset: q.offset,
    }
    .resolve()?;

    let mut tag_ids: Vec<String> = Vec::new();
    for (k, v) in pairs {
        if k == "tag_id" && !tag_ids.contains(&v) {
            tag_ids.push(v);
        }
    }

    let sql = build_sql(&q, &tag_ids, &who.library_id, &who.user_id, limit, offset)?;
    let out = state
        .db
        .run(move |conn| {
            let total: i64 = conn.query_row(
                &sql.count,
                rusqlite::params_from_iter(sql.count_args.iter()),
                |r| r.get(0),
            )?;
            let mut stmt = conn.prepare(&sql.list)?;
            let mut items = stmt
                .query_map(rusqlite::params_from_iter(sql.list_args.iter()), map_book)?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            attach_reading(conn, &who.user_id, &mut items)?;
            attach_tags(conn, &mut items)?;
            Ok(BookList { items, total })
        })
        .await?;
    Ok(Json(out))
}

#[cfg(test)]
mod tests {
    use super::fts_expression;

    #[test]
    fn expression_quotes_words_and_prefixes_the_last() {
        assert_eq!(
            fts_expression("nome  rosa").as_deref(),
            Some("\"nome\" \"rosa\"*")
        );
        assert_eq!(
            fts_expression("a OR b").as_deref(),
            Some("\"a\" \"OR\" \"b\"*")
        );
        assert_eq!(fts_expression("\" * ( - :"), None);
        let many = (0..30)
            .map(|i| format!("w{i}"))
            .collect::<Vec<_>>()
            .join(" ");
        assert_eq!(fts_expression(&many).unwrap().split(' ').count(), 16);
    }
}
