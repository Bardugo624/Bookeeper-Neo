use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{get, post},
    Json,
};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Deserializer, Serialize};
use utoipa::ToSchema;

use crate::{
    api::util::{new_id, now_secs, ApiQuery, Page},
    audit,
    auth::{guard::AuthUser, Role},
    error::{ApiError, ApiErrorBody, ApiResult},
    extract::ApiJson,
    state::AppState,
};

pub fn routes() -> axum::Router<AppState> {
    axum::Router::new()
        .route("/api/v1/loans", get(list_loans).post(create_loan))
        .route(
            "/api/v1/loans/{id}",
            axum::routing::patch(patch_loan).delete(delete_loan),
        )
        .route("/api/v1/loans/{id}/return", post(return_loan))
        .route("/api/v1/loans/{id}/reopen", post(reopen_loan))
}

#[derive(utoipa::OpenApi)]
#[openapi(
    paths(
        list_loans,
        create_loan,
        patch_loan,
        delete_loan,
        return_loan,
        reopen_loan
    ),
    components(schemas(LoanOut, LoanList, CreateLoan, PatchLoan, ReturnLoan, ListLoansQuery))
)]
pub struct Doc;

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct LoanOut {
    pub id: String,
    pub book_id: String,
    pub book_title: String,
    pub book_authors: Vec<String>,
    pub borrower_name: String,
    pub borrower_user_id: Option<String>,
    pub lent_at: i64,
    pub due_at: Option<i64>,
    pub returned_at: Option<i64>,
    pub notes: Option<String>,
    /// Open loan whose `due_at` is in the past.
    pub overdue: bool,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct LoanList {
    pub items: Vec<LoanOut>,
    pub total: i64,
}

/// Body of `POST /loans`.
#[derive(Debug, Clone, Deserialize, ToSchema)]
pub struct CreateLoan {
    pub book_id: String,
    pub borrower_name: String,
    /// Unix seconds; defaults to now.
    pub lent_at: Option<i64>,
    pub due_at: Option<i64>,
    pub notes: Option<String>,
}

fn present<'de, D, T>(d: D) -> Result<Option<Option<T>>, D::Error>
where
    D: Deserializer<'de>,
    T: Deserialize<'de>,
{
    Option::<T>::deserialize(d).map(Some)
}

/// Body of `PATCH /loans/{id}`: absent = unchanged, `null` clears `due_at` and
/// `notes`. `book_id` is accepted only to be rejected.
#[derive(Debug, Default, Deserialize, ToSchema)]
pub struct PatchLoan {
    #[serde(default, deserialize_with = "present")]
    #[schema(value_type = Option<String>)]
    pub borrower_name: Option<Option<String>>,
    #[serde(default, deserialize_with = "present")]
    #[schema(value_type = Option<i64>)]
    pub lent_at: Option<Option<i64>>,
    #[serde(default, deserialize_with = "present")]
    #[schema(value_type = Option<i64>)]
    pub due_at: Option<Option<i64>>,
    #[serde(default, deserialize_with = "present")]
    #[schema(value_type = Option<String>)]
    pub notes: Option<Option<String>>,
    #[serde(default, deserialize_with = "present")]
    #[schema(value_type = Option<String>)]
    pub book_id: Option<Option<String>>,
}

#[derive(Debug, Default, Deserialize, ToSchema)]
pub struct ReturnLoan {
    /// Unix seconds; defaults to now.
    pub returned_at: Option<i64>,
}

/// JSON body that may be absent: no body, an empty body or `{}` give the
/// default value; a present but malformed body is still rejected.
pub struct OptionalJson<T>(pub T);

impl<S, T> axum::extract::FromRequest<S> for OptionalJson<T>
where
    S: Send + Sync,
    T: serde::de::DeserializeOwned + Default,
{
    type Rejection = ApiError;

    async fn from_request(req: axum::extract::Request, state: &S) -> Result<Self, ApiError> {
        let bytes = axum::body::Bytes::from_request(req, state)
            .await
            .map_err(|e| {
                if e.status() == StatusCode::PAYLOAD_TOO_LARGE {
                    ApiError::coded(
                        StatusCode::PAYLOAD_TOO_LARGE,
                        "payload_too_large",
                        "Request body is too large",
                    )
                } else {
                    ApiError::bad_request("Invalid request body")
                }
            })?;
        if bytes.iter().all(u8::is_ascii_whitespace) {
            return Ok(OptionalJson(T::default()));
        }
        match serde_json::from_slice::<T>(&bytes) {
            Ok(v) => Ok(OptionalJson(v)),
            Err(e) if e.is_data() => Err(ApiError::validation(
                "Invalid or missing fields in request body",
            )),
            Err(_) => Err(ApiError::bad_request("Malformed JSON")),
        }
    }
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct ListLoansQuery {
    /// `active` (default), `returned`, `overdue` or `all`.
    pub status: Option<String>,
    pub book_id: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

const SELECT_LOAN: &str = "SELECT l.id, l.book_id, b.title, b.authors_json, l.borrower_name, \
    l.borrower_user_id, l.lent_at, l.due_at, l.returned_at, l.notes \
    FROM loans l JOIN books b ON b.id = l.book_id";

fn map_loan(row: &rusqlite::Row<'_>, now: i64) -> rusqlite::Result<LoanOut> {
    let authors_json: String = row.get(3)?;
    let due_at: Option<i64> = row.get(7)?;
    let returned_at: Option<i64> = row.get(8)?;
    Ok(LoanOut {
        id: row.get(0)?,
        book_id: row.get(1)?,
        book_title: row.get(2)?,
        book_authors: serde_json::from_str(&authors_json).unwrap_or_default(),
        borrower_name: row.get(4)?,
        borrower_user_id: row.get(5)?,
        lent_at: row.get(6)?,
        due_at,
        returned_at,
        notes: row.get(9)?,
        overdue: returned_at.is_none() && due_at.is_some_and(|d| d < now),
    })
}

fn fetch(conn: &Connection, library_id: &str, id: &str) -> rusqlite::Result<Option<LoanOut>> {
    let now = now_secs();
    conn.query_row(
        &format!("{SELECT_LOAN} WHERE l.library_id = ?1 AND l.id = ?2"),
        params![library_id, id],
        |r| map_loan(r, now),
    )
    .optional()
}

fn is_unique_violation(e: &rusqlite::Error) -> bool {
    matches!(
        e,
        rusqlite::Error::SqliteFailure(f, _) if f.code == rusqlite::ErrorCode::ConstraintViolation
    )
}

fn already_lent() -> ApiError {
    ApiError::conflict("book_already_lent", "The book already has an open loan")
}

fn check_name(raw: &str) -> ApiResult<String> {
    let name = raw.trim();
    if !(1..=120).contains(&name.chars().count()) {
        return Err(ApiError::validation(
            "borrower_name must be between 1 and 120 characters",
        ));
    }
    Ok(name.to_string())
}

fn check_notes(notes: &Option<String>) -> ApiResult<()> {
    match notes {
        Some(n) if n.chars().count() > 10_000 => Err(ApiError::validation(
            "notes must be at most 10000 characters",
        )),
        _ => Ok(()),
    }
}

fn check_dates(lent_at: i64, due_at: Option<i64>) -> ApiResult<()> {
    match due_at {
        Some(d) if d < lent_at => Err(ApiError::validation("due_at cannot precede lent_at")),
        _ => Ok(()),
    }
}

#[utoipa::path(
    get,
    path = "/api/v1/loans",
    tag = "loans",
    security(("bearer" = [])),
    params(
        ("status" = Option<String>, Query, description = "active (default), returned, overdue or all"),
        ("book_id" = Option<String>, Query, description = "Only the loans of this book"),
        ("limit" = Option<i64>, Query, description = "1 to 200, default 50"),
        ("offset" = Option<i64>, Query, description = "Default 0"),
    ),
    responses(
        (status = 200, description = "Loans", body = LoanList),
        (status = 422, description = "Invalid query", body = ApiErrorBody),
    )
)]
pub async fn list_loans(
    State(state): State<AppState>,
    who: AuthUser,
    ApiQuery(q): ApiQuery<ListLoansQuery>,
) -> ApiResult<Json<LoanList>> {
    let (limit, offset) = Page {
        limit: q.limit,
        offset: q.offset,
    }
    .resolve()?;
    let now = now_secs();
    let overdue_cond = format!("l.returned_at IS NULL AND l.due_at < {now}");
    let cond = match q.status.as_deref().unwrap_or("active") {
        "active" => "l.returned_at IS NULL",
        "returned" => "l.returned_at IS NOT NULL",
        "overdue" => &overdue_cond,
        "all" => "1 = 1",
        _ => {
            return Err(ApiError::validation(
                "status must be active, returned, overdue or all",
            ))
        }
    };
    let cond = cond.to_string();
    let book_id = q.book_id;
    let out = state
        .db
        .run(move |conn| {
            let filter =
                format!("WHERE l.library_id = ?1 AND (?2 IS NULL OR l.book_id = ?2) AND {cond}");
            let total: i64 = conn.query_row(
                &format!("SELECT COUNT(*) FROM loans l {filter}"),
                params![who.library_id, book_id],
                |r| r.get(0),
            )?;
            let sql = format!(
                "{SELECT_LOAN} {filter} ORDER BY l.returned_at IS NOT NULL, \
                 CASE WHEN l.returned_at IS NULL THEN l.due_at IS NULL ELSE 0 END, \
                 CASE WHEN l.returned_at IS NULL THEN l.due_at END ASC, \
                 CASE WHEN l.returned_at IS NULL THEN l.lent_at END DESC, \
                 l.returned_at DESC, l.id DESC LIMIT ?3 OFFSET ?4"
            );
            let mut stmt = conn.prepare(&sql)?;
            let items = stmt
                .query_map(params![who.library_id, book_id, limit, offset], |r| {
                    map_loan(r, now)
                })?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            Ok(LoanList { items, total })
        })
        .await?;
    Ok(Json(out))
}

#[utoipa::path(
    post,
    path = "/api/v1/loans",
    tag = "loans",
    security(("bearer" = [])),
    request_body = CreateLoan,
    responses(
        (status = 201, description = "Created loan", body = LoanOut),
        (status = 403, description = "Guests cannot write", body = ApiErrorBody),
        (status = 404, description = "Unknown book", body = ApiErrorBody),
        (status = 409, description = "book_already_lent", body = ApiErrorBody),
        (status = 422, description = "Invalid body", body = ApiErrorBody),
    )
)]
pub async fn create_loan(
    State(state): State<AppState>,
    who: AuthUser,
    ApiJson(body): ApiJson<CreateLoan>,
) -> ApiResult<(StatusCode, Json<LoanOut>)> {
    who.require(Role::Member)?;
    let name = check_name(&body.borrower_name)?;
    check_notes(&body.notes)?;
    let now = now_secs();
    let lent_at = body.lent_at.unwrap_or(now);
    check_dates(lent_at, body.due_at)?;
    let out = state
        .db
        .run(move |conn| {
            let tx = conn.transaction()?;
            let exists: bool = tx.query_row(
                "SELECT EXISTS(SELECT 1 FROM books WHERE id = ?1 AND library_id = ?2)",
                params![body.book_id, who.library_id],
                |r| r.get(0),
            )?;
            if !exists {
                return Ok(Err(ApiError::not_found()));
            }
            let open: bool = tx.query_row(
                "SELECT EXISTS(SELECT 1 FROM loans WHERE book_id = ?1 AND returned_at IS NULL)",
                params![body.book_id],
                |r| r.get(0),
            )?;
            if open {
                return Ok(Err(already_lent()));
            }
            let id = new_id();
            let inserted = tx.execute(
                "INSERT INTO loans (id, library_id, book_id, borrower_name, borrower_user_id, \
                 lent_at, due_at, returned_at, notes) VALUES (?1, ?2, ?3, ?4, NULL, ?5, ?6, NULL, ?7)",
                params![
                    id,
                    who.library_id,
                    body.book_id,
                    name,
                    lent_at,
                    body.due_at,
                    body.notes
                ],
            );
            match inserted {
                Ok(_) => {}
                Err(e) if is_unique_violation(&e) => return Ok(Err(already_lent())),
                Err(e) => return Err(e),
            }
            audit::record(
                &tx,
                &who,
                "loan.create",
                "loan",
                &id,
                Some(&serde_json::json!({ "book_id": body.book_id })),
                now,
            )?;
            let out = fetch(&tx, &who.library_id, &id)?;
            tx.commit()?;
            Ok(out.ok_or_else(ApiError::internal))
        })
        .await??;
    Ok((StatusCode::CREATED, Json(out)))
}

#[utoipa::path(
    patch,
    path = "/api/v1/loans/{id}",
    tag = "loans",
    security(("bearer" = [])),
    params(("id" = String, Path, description = "Loan id")),
    request_body = PatchLoan,
    responses(
        (status = 200, description = "Updated loan", body = LoanOut),
        (status = 403, description = "Guests cannot write", body = ApiErrorBody),
        (status = 404, description = "Unknown loan", body = ApiErrorBody),
        (status = 422, description = "Invalid body", body = ApiErrorBody),
    )
)]
pub async fn patch_loan(
    State(state): State<AppState>,
    who: AuthUser,
    Path(id): Path<String>,
    ApiJson(body): ApiJson<PatchLoan>,
) -> ApiResult<Json<LoanOut>> {
    who.require(Role::Member)?;
    if body.book_id.is_some() {
        return Err(ApiError::validation("book_id cannot be changed"));
    }
    let out = state
        .db
        .run(move |conn| {
            let tx = conn.transaction()?;
            let Some(current) = fetch(&tx, &who.library_id, &id)? else {
                return Ok(Err(ApiError::not_found()));
            };
            let name = match body.borrower_name {
                None => current.borrower_name.clone(),
                Some(Some(n)) => match check_name(&n) {
                    Ok(n) => n,
                    Err(e) => return Ok(Err(e)),
                },
                Some(None) => return Ok(Err(ApiError::validation("borrower_name cannot be null"))),
            };
            let lent_at = match body.lent_at {
                None => current.lent_at,
                Some(Some(t)) => t,
                Some(None) => return Ok(Err(ApiError::validation("lent_at cannot be null"))),
            };
            let due_at = body.due_at.unwrap_or(current.due_at);
            let notes = body.notes.unwrap_or(current.notes);
            if let Err(e) = check_notes(&notes).and_then(|()| check_dates(lent_at, due_at)) {
                return Ok(Err(e));
            }
            if current.returned_at.is_some_and(|r| lent_at > r) {
                return Ok(Err(ApiError::validation(
                    "lent_at cannot be after returned_at",
                )));
            }
            tx.execute(
                "UPDATE loans SET borrower_name = ?1, lent_at = ?2, due_at = ?3, notes = ?4 \
                 WHERE id = ?5 AND library_id = ?6",
                params![name, lent_at, due_at, notes, id, who.library_id],
            )?;
            audit::record(&tx, &who, "loan.update", "loan", &id, None, now_secs())?;
            let out = fetch(&tx, &who.library_id, &id)?;
            tx.commit()?;
            Ok(out.ok_or_else(ApiError::internal))
        })
        .await??;
    Ok(Json(out))
}

#[utoipa::path(
    delete,
    path = "/api/v1/loans/{id}",
    tag = "loans",
    security(("bearer" = [])),
    params(("id" = String, Path, description = "Loan id")),
    responses(
        (status = 204, description = "Deleted"),
        (status = 403, description = "Guests cannot write", body = ApiErrorBody),
        (status = 404, description = "Unknown loan", body = ApiErrorBody),
    )
)]
pub async fn delete_loan(
    State(state): State<AppState>,
    who: AuthUser,
    Path(id): Path<String>,
) -> ApiResult<StatusCode> {
    who.require(Role::Member)?;
    state
        .db
        .run(move |conn| {
            let tx = conn.transaction()?;
            let n = tx.execute(
                "DELETE FROM loans WHERE id = ?1 AND library_id = ?2",
                params![id, who.library_id],
            )?;
            if n == 0 {
                return Ok(Err(ApiError::not_found()));
            }
            audit::record(&tx, &who, "loan.delete", "loan", &id, None, now_secs())?;
            tx.commit()?;
            Ok(Ok(()))
        })
        .await??;
    Ok(StatusCode::NO_CONTENT)
}

#[utoipa::path(
    post,
    path = "/api/v1/loans/{id}/return",
    tag = "loans",
    security(("bearer" = [])),
    params(("id" = String, Path, description = "Loan id")),
    request_body = Option<ReturnLoan>,
    responses(
        (status = 200, description = "Returned loan", body = LoanOut),
        (status = 403, description = "Guests cannot write", body = ApiErrorBody),
        (status = 404, description = "Unknown loan", body = ApiErrorBody),
        (status = 422, description = "returned_at before lent_at", body = ApiErrorBody),
    )
)]
pub async fn return_loan(
    State(state): State<AppState>,
    who: AuthUser,
    Path(id): Path<String>,
    OptionalJson(body): OptionalJson<ReturnLoan>,
) -> ApiResult<Json<LoanOut>> {
    who.require(Role::Member)?;
    let out = state
        .db
        .run(move |conn| {
            let tx = conn.transaction()?;
            let Some(current) = fetch(&tx, &who.library_id, &id)? else {
                return Ok(Err(ApiError::not_found()));
            };
            if current.returned_at.is_some() {
                return Ok(Ok(current));
            }
            let now = now_secs();
            let returned_at = body.returned_at.unwrap_or(now);
            if returned_at < current.lent_at {
                return Ok(Err(ApiError::validation(
                    "returned_at cannot precede lent_at",
                )));
            }
            tx.execute(
                "UPDATE loans SET returned_at = ?1 WHERE id = ?2 AND library_id = ?3",
                params![returned_at, id, who.library_id],
            )?;
            audit::record(&tx, &who, "loan.return", "loan", &id, None, now)?;
            let out = fetch(&tx, &who.library_id, &id)?;
            tx.commit()?;
            Ok(out.ok_or_else(ApiError::internal))
        })
        .await??;
    Ok(Json(out))
}

#[utoipa::path(
    post,
    path = "/api/v1/loans/{id}/reopen",
    tag = "loans",
    security(("bearer" = [])),
    params(("id" = String, Path, description = "Loan id")),
    responses(
        (status = 200, description = "Reopened loan", body = LoanOut),
        (status = 403, description = "Guests cannot write", body = ApiErrorBody),
        (status = 404, description = "Unknown loan", body = ApiErrorBody),
        (status = 409, description = "book_already_lent", body = ApiErrorBody),
    )
)]
pub async fn reopen_loan(
    State(state): State<AppState>,
    who: AuthUser,
    Path(id): Path<String>,
) -> ApiResult<Json<LoanOut>> {
    who.require(Role::Member)?;
    let out = state
        .db
        .run(move |conn| {
            let tx = conn.transaction()?;
            let Some(current) = fetch(&tx, &who.library_id, &id)? else {
                return Ok(Err(ApiError::not_found()));
            };
            if current.returned_at.is_none() {
                return Ok(Ok(current));
            }
            let updated = tx.execute(
                "UPDATE loans SET returned_at = NULL WHERE id = ?1 AND library_id = ?2",
                params![id, who.library_id],
            );
            match updated {
                Ok(_) => {}
                Err(e) if is_unique_violation(&e) => return Ok(Err(already_lent())),
                Err(e) => return Err(e),
            }
            audit::record(&tx, &who, "loan.reopen", "loan", &id, None, now_secs())?;
            let out = fetch(&tx, &who.library_id, &id)?;
            tx.commit()?;
            Ok(out.ok_or_else(ApiError::internal))
        })
        .await??;
    Ok(Json(out))
}
