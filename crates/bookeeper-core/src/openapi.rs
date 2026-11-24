use utoipa::OpenApi;

use crate::{
    api::{auth, devices, health, pairing, setup},
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
    doc.info.version = crate::VERSION.to_string();
    doc
}
