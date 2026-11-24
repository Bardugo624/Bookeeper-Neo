use utoipa::OpenApi;

use crate::{
    api::{
        auth, backup, books, books_search, confirm, covers, devices, health, labels, loans, lookup,
        pairing, server, setup, shelves, stats, transfer, wishlist,
    },
    error::ApiErrorBody,
};

#[derive(OpenApi)]
#[openapi(
    info(title = "Bookeeper API"),
    paths(health::health, server::server_info),
    components(schemas(health::Health, server::ServerOut, crate::TlsMode, ApiErrorBody))
)]
struct ApiDoc;

/// OpenAPI specification of the Bookeeper HTTP API.
pub fn openapi() -> utoipa::openapi::OpenApi {
    let mut doc = ApiDoc::openapi();
    doc.merge(setup::Doc::openapi());
    doc.merge(auth::Doc::openapi());
    doc.merge(pairing::Doc::openapi());
    doc.merge(devices::Doc::openapi());
    doc.merge(books::Doc::openapi());
    doc.merge(books_search::Doc::openapi());
    doc.merge(shelves::Doc::openapi());
    doc.merge(loans::Doc::openapi());
    doc.merge(wishlist::Doc::openapi());
    doc.merge(stats::Doc::openapi());
    doc.merge(lookup::Doc::openapi());
    doc.merge(covers::Doc::openapi());
    doc.merge(transfer::Doc::openapi());
    doc.merge(confirm::Doc::openapi());
    doc.merge(backup::Doc::openapi());
    doc.merge(labels::Doc::openapi());
    doc.info.version = crate::VERSION.to_string();
    doc
}
