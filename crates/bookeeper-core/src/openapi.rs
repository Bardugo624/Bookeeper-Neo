use utoipa::OpenApi;

use crate::{api::health, error::ApiErrorBody};

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
    doc.info.version = crate::VERSION.to_string();
    doc
}
