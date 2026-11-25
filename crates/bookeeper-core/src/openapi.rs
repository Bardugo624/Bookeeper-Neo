use utoipa::OpenApi;

use crate::{
    api::{
        auth, backup, books, books_search, confirm, covers, devices, facets, health, labels, loans,
        lookup, pairing, reading, rooms, server, setup, shelves, stats, tags, transfer, wishlist,
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
    doc.merge(facets::Doc::openapi());
    doc.merge(reading::Doc::openapi());
    doc.merge(tags::Doc::openapi());
    doc.merge(rooms::Doc::openapi());
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
    document_json_errors(&mut doc);
    doc
}

/// Errors of the `ApiJson` extractor, which every JSON-body route can give.
const JSON_ERRORS: [(&str, &str); 3] = [
    ("400", "bad_request"),
    ("413", "payload_too_large"),
    ("422", "validation"),
];

/// Adds the extractor's 400, 413 and 422 responses to every operation with an
/// `application/json` request body, keeping any response the route documents.
fn document_json_errors(doc: &mut utoipa::openapi::OpenApi) {
    use utoipa::openapi::{
        content::ContentBuilder, path::PathItem, response::ResponseBuilder, Ref, RefOr,
    };

    for item in doc.paths.paths.values_mut() {
        let PathItem {
            get,
            put,
            post,
            delete,
            options,
            head,
            patch,
            trace,
            ..
        } = item;
        for op in [get, put, post, delete, options, head, patch, trace]
            .into_iter()
            .flatten()
        {
            let json = op
                .request_body
                .as_ref()
                .is_some_and(|b| b.content.contains_key("application/json"));
            if !json {
                continue;
            }
            for (status, description) in JSON_ERRORS {
                if op.responses.responses.contains_key(status) {
                    continue;
                }
                let response = ResponseBuilder::new()
                    .description(description)
                    .content(
                        "application/json",
                        ContentBuilder::new()
                            .schema(Some(RefOr::Ref(Ref::from_schema_name("ApiErrorBody"))))
                            .build(),
                    )
                    .build();
                op.responses
                    .responses
                    .insert(status.to_string(), RefOr::T(response));
            }
        }
    }
}
