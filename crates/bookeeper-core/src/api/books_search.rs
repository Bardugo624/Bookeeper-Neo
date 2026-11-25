use axum::{extract::State, routing::get, Json};
use rusqlite::types::Value;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::{
    api::books::{map_book, BookOut, SELECT_BOOK},
    api::util::{ApiQuery, Page},
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
    pub genre: Option<String>,
    pub language: Option<String>,
    /// `hardcover`, `paperback`, `ebook` or `audiobook`.
    pub format: Option<String>,
    pub shelf_id: Option<String>,
    /// `true`: only books without a placement.
    pub unshelved: Option<String>,
    /// `true`: only books with an open loan; `false`: only the others.
    pub on_loan: Option<String>,
    /// `created_at` (default), `title`, `author`, `year` or `progressive`.
    pub sort: Option<String>,
    /// `asc` or `desc`; default `desc` for `created_at`, `asc` otherwise.
    pub order: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

const FROM_BOOKS: &str = "FROM books b \
    LEFT JOIN shelf_books sb ON sb.book_id = b.id \
    LEFT JOIN loans l ON l.book_id = b.id AND l.returned_at IS NULL";

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

#[utoipa::path(
    get,
    path = "/api/v1/books",
    tag = "books",
    security(("bearer" = [])),
    params(
        ("q" = Option<String>, Query, description = "Full-text search; the last word matches by prefix"),
        ("genre" = Option<String>, Query, description = "Exact match"),
        ("language" = Option<String>, Query, description = "Exact match"),
        ("format" = Option<String>, Query, description = "hardcover, paperback, ebook or audiobook"),
        ("shelf_id" = Option<String>, Query, description = "Only books placed on this shelf"),
        ("unshelved" = Option<bool>, Query, description = "true: only books without a placement"),
        ("on_loan" = Option<bool>, Query, description = "true: open loan; false: no open loan"),
        ("sort" = Option<String>, Query, description = "created_at (default), title, author, year or progressive"),
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
) -> ApiResult<Json<BookList>> {
    let (limit, offset) = Page {
        limit: q.limit,
        offset: q.offset,
    }
    .resolve()?;

    let sort = q.sort.as_deref();
    let sort_key = match sort {
        None | Some("created_at") => "created_at",
        Some("title") => "title",
        Some("author") => "author",
        Some("year") => "year",
        Some("progressive") => "progressive",
        Some(_) => {
            return Err(ApiError::validation(
                "sort must be created_at, title, author, year or progressive",
            ))
        }
    };
    let desc = match q.order.as_deref() {
        None => sort_key == "created_at",
        Some("asc") => false,
        Some("desc") => true,
        Some(_) => return Err(ApiError::validation("order must be asc or desc")),
    };
    if let Some(f) = q.format.as_deref() {
        if !["hardcover", "paperback", "ebook", "audiobook"].contains(&f) {
            return Err(ApiError::validation(
                "format must be hardcover, paperback, ebook or audiobook",
            ));
        }
    }
    let unshelved = parse_bool("unshelved", &q.unshelved)? == Some(true);
    let on_loan = parse_bool("on_loan", &q.on_loan)?;
    if unshelved && q.shelf_id.is_some() {
        return Err(ApiError::validation(
            "shelf_id and unshelved=true cannot be combined",
        ));
    }
    let fts = q.q.as_deref().and_then(fts_expression);

    // Only fixed fragments are concatenated; every request value is bound.
    let mut args: Vec<Value> = vec![Value::Text(who.library_id.clone())];
    let mut conds: Vec<String> = vec!["b.library_id = ?1".to_string()];
    let bind = |args: &mut Vec<Value>, v: Value| {
        args.push(v);
        args.len()
    };
    for (col, val) in [
        ("b.genre", &q.genre),
        ("b.language", &q.language),
        ("b.format", &q.format),
        ("sb.shelf_id", &q.shelf_id),
    ] {
        if let Some(v) = val {
            let n = bind(&mut args, Value::Text(v.clone()));
            conds.push(format!("{col} = ?{n}"));
        }
    }
    if unshelved {
        conds.push("sb.book_id IS NULL".to_string());
    }
    match on_loan {
        Some(true) => conds.push("l.id IS NOT NULL".to_string()),
        Some(false) => conds.push("l.id IS NULL".to_string()),
        None => {}
    }
    let mut from = FROM_BOOKS.to_string();
    if let Some(expr) = &fts {
        let n = bind(&mut args, Value::Text(expr.clone()));
        from.push_str(" JOIN books_fts ON books_fts.rowid = b.rowid");
        conds.push(format!("books_fts MATCH ?{n}"));
    }
    let filter = format!("WHERE {}", conds.join(" AND "));

    let dir = if desc { "DESC" } else { "ASC" };
    if fts.is_some() && sort.is_none() && q.order.is_some() {
        return Err(ApiError::validation(
            "order requires sort when searching with q",
        ));
    }
    let order = match (sort_key, sort, fts.is_some()) {
        ("created_at", None, true) => "bm25(books_fts), b.created_at DESC, b.id DESC".to_string(),
        ("created_at", _, _) => format!("b.created_at {dir}, b.id {dir}"),
        ("title", ..) => format!("b.title COLLATE NOCASE {dir}, b.id {dir}"),
        ("author", ..) => {
            let e = "json_extract(b.authors_json, '$[0]')";
            format!("{e} IS NULL, {e} COLLATE NOCASE {dir}, b.id {dir}")
        }
        ("year", ..) => {
            format!("b.published_year IS NULL, b.published_year {dir}, b.id {dir}")
        }
        _ => format!("b.progressive_number IS NULL, b.progressive_number {dir}, b.id {dir}"),
    };

    let out = state
        .db
        .run(move |conn| {
            let total: i64 = conn.query_row(
                &format!("SELECT COUNT(*) {from} {filter}"),
                rusqlite::params_from_iter(args.iter()),
                |r| r.get(0),
            )?;
            let n = args.len();
            let sql = format!(
                "{SELECT_BOOK}{} {filter} ORDER BY {order} LIMIT ?{} OFFSET ?{}",
                &from[FROM_BOOKS.len()..],
                n + 1,
                n + 2
            );
            args.push(Value::Integer(limit));
            args.push(Value::Integer(offset));
            let mut stmt = conn.prepare(&sql)?;
            let items = stmt
                .query_map(rusqlite::params_from_iter(args.iter()), map_book)?
                .collect::<rusqlite::Result<Vec<_>>>()?;
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
