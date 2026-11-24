use utoipa::OpenApi;

use crate::{
    api::{
        auth, books, books_search, devices, health, loans, pairing, setup, shelves, stats, wishlist,
    },
    error::ApiErrorBody,
};

#[derive(OpenApi)]
#[openapi(
    info(title = "Bookeeper API"),
    paths(health::health),
    components(schemas(health::Health, ApiErrorBody))
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
    doc.info.version = crate::VERSION.to_string();
    doc
}
