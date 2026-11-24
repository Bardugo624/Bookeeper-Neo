//! `POST /labels/pdf`.
use std::collections::HashSet;

use axum::{extract::State, response::Response, routing::post};
use rusqlite::params;
use serde::Deserialize;
use utoipa::ToSchema;

use crate::{
    api::util::download,
    auth::guard::AuthUser,
    error::{ApiError, ApiErrorBody, ApiResult},
    extract::ApiJson,
    labels::{render_pdf, Label},
    state::AppState,
};

const MAX_IDS: usize = 2000;

pub fn routes() -> axum::Router<AppState> {
    axum::Router::new().route("/api/v1/labels/pdf", post(labels_pdf))
}

#[derive(utoipa::OpenApi)]
#[openapi(paths(labels_pdf), components(schemas(LabelsRequest)))]
pub struct Doc;

#[derive(Debug, Deserialize, ToSchema)]
pub struct LabelsRequest {
    /// 1 to 2000 book ids.
    pub book_ids: Vec<String>,
}

/// A4 sheet of labels (4 × 11) with a Data Matrix per book.
///
/// Books that are unknown, in another library or without a progressive number are skipped;
/// their count is in the `X-Labels-Skipped` header.
#[utoipa::path(
    post,
    path = "/api/v1/labels/pdf",
    tag = "labels",
    security(("bearer" = [])),
    request_body = LabelsRequest,
    responses(
        (status = 200, description = "PDF file; header X-Labels-Skipped", content_type = "application/pdf", body = Vec<u8>),
        (status = 401, description = "Missing or invalid token", body = ApiErrorBody),
        (status = 422, description = "Invalid ids or nothing to print", body = ApiErrorBody),
    )
)]
pub async fn labels_pdf(
    State(state): State<AppState>,
    who: AuthUser,
    ApiJson(body): ApiJson<LabelsRequest>,
) -> ApiResult<Response> {
    if body.book_ids.is_empty() || body.book_ids.len() > MAX_IDS {
        return Err(ApiError::validation("book_ids must contain 1 to 2000 ids"));
    }
    let mut seen = HashSet::new();
    let ids: Vec<String> = body
        .book_ids
        .into_iter()
        .filter(|id| seen.insert(id.clone()))
        .collect();
    let requested = ids.len();
    let library_id = who.library_id.clone();
    let labels: Vec<Label> = state
        .db
        .run(move |conn| {
            let mut stmt = conn.prepare(
                "SELECT b.progressive_number, b.title, b.authors_json, s.name, s.label_code,
                        sb.row_index, sb.slot_index
                 FROM books b
                 LEFT JOIN shelf_books sb ON sb.book_id = b.id
                 LEFT JOIN shelves s ON s.id = sb.shelf_id
                 WHERE b.id = ?1 AND b.library_id = ?2 AND b.progressive_number IS NOT NULL",
            )?;
            let mut out = Vec::new();
            for id in &ids {
                let found = stmt.query_row(params![id, library_id], |r| {
                    let authors_json: String = r.get(2)?;
                    let authors: Vec<String> =
                        serde_json::from_str(&authors_json).unwrap_or_default();
                    let shelf_name: Option<String> = r.get(3)?;
                    let row: Option<i64> = r.get(5)?;
                    let slot: Option<i64> = r.get(6)?;
                    Ok(Label {
                        progressive: r.get(0)?,
                        title: r.get(1)?,
                        authors: authors.join(", "),
                        shelf_code: r.get::<_, Option<i64>>(4)?.unwrap_or(0),
                        shelf_name,
                        row: row.map_or(0, |v| v + 1),
                        slot: slot.map_or(0, |v| v + 1),
                    })
                });
                match found {
                    Ok(l) => out.push(l),
                    Err(rusqlite::Error::QueryReturnedNoRows) => {}
                    Err(e) => return Err(e),
                }
            }
            Ok(out)
        })
        .await?;
    if labels.is_empty() {
        return Err(ApiError::validation("No book to print a label for"));
    }
    let skipped = requested - labels.len();
    let pdf = tokio::task::spawn_blocking(move || render_pdf(&labels))
        .await
        .map_err(|_| ApiError::internal())?
        .map_err(|e| {
            tracing::error!(error = %e, "label generation failed");
            ApiError::internal()
        })?;
    let name = format!("etichette-{}.pdf", chrono::Utc::now().format("%Y%m%d"));
    let mut res = download(pdf, "application/pdf", &name);
    res.headers_mut().insert(
        "x-labels-skipped",
        axum::http::HeaderValue::from(skipped as u64),
    );
    Ok(res)
}
