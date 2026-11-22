use axum::{
    extract::{rejection::JsonRejection, FromRequest, Request},
    Json,
};
use serde::de::DeserializeOwned;

use crate::error::ApiError;

/// JSON body extractor that reports every rejection as an [`ApiError`].
pub struct ApiJson<T>(pub T);

impl<S, T> FromRequest<S> for ApiJson<T>
where
    S: Send + Sync,
    T: DeserializeOwned,
{
    type Rejection = ApiError;

    async fn from_request(req: Request, state: &S) -> Result<Self, ApiError> {
        match Json::<T>::from_request(req, state).await {
            Ok(Json(v)) => Ok(ApiJson(v)),
            Err(JsonRejection::JsonDataError(_)) => Err(ApiError::validation(
                "Invalid or missing fields in request body",
            )),
            Err(JsonRejection::JsonSyntaxError(_)) => Err(ApiError::bad_request("Malformed JSON")),
            Err(JsonRejection::MissingJsonContentType(_)) => Err(ApiError::bad_request(
                "Expected content-type: application/json",
            )),
            Err(_) => Err(ApiError::bad_request("Invalid request body")),
        }
    }
}
