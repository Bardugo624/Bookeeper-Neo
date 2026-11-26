//! Every documented operation must document the error responses it can give.

use serde_json::Value;

/// Operations that legitimately document no 4xx response.
const NO_CLIENT_ERROR: &[(&str, &str)] = &[
    ("get", "/api/v1/health"),
    ("get", "/api/v1/openapi.json"),
    ("get", "/api/v1/server"),
    // Public status probe: its handler has no client-error path.
    ("get", "/api/v1/setup"),
];

/// Operations whose handler calls `require(Role::…)` above guest, or uses an
/// owner-only extractor (`OwnerConfirmed`).
///
/// To update: `grep -n "require(Role::" crates/bookeeper-core/src/api/*.rs`,
/// map each hit to its handler's `#[utoipa::path]` method and path, and add or
/// remove the entry here.
const ROLE_GATED: &[(&str, &str)] = &[
    ("post", "/api/v1/backup"),
    ("post", "/api/v1/restore"),
    ("get", "/api/v1/backups"),
    ("get", "/api/v1/backups/config"),
    ("put", "/api/v1/backups/config"),
    ("post", "/api/v1/books"),
    ("patch", "/api/v1/books/{id}"),
    ("delete", "/api/v1/books/{id}"),
    ("post", "/api/v1/books/batch-delete"),
    ("put", "/api/v1/books/{id}/cover"),
    ("post", "/api/v1/books/{id}/cover/fetch"),
    ("delete", "/api/v1/books/{id}/cover"),
    ("post", "/api/v1/loans"),
    ("patch", "/api/v1/loans/{id}"),
    ("delete", "/api/v1/loans/{id}"),
    ("post", "/api/v1/loans/{id}/return"),
    ("post", "/api/v1/loans/{id}/reopen"),
    ("post", "/api/v1/pairing/codes"),
    ("post", "/api/v1/shelves"),
    ("patch", "/api/v1/shelves/{id}"),
    ("delete", "/api/v1/shelves/{id}"),
    ("put", "/api/v1/books/{id}/placement"),
    ("delete", "/api/v1/books/{id}/placement"),
    ("post", "/api/v1/shelves/{id}/batch-assign"),
    ("post", "/api/v1/import"),
    ("get", "/api/v1/export"),
    ("post", "/api/v1/wishlist"),
    ("patch", "/api/v1/wishlist/{id}"),
    ("delete", "/api/v1/wishlist/{id}"),
    ("post", "/api/v1/wishlist/{id}/convert"),
    ("get", "/api/v1/loans/borrowers"),
    ("post", "/api/v1/tags"),
    ("patch", "/api/v1/tags/{id}"),
    ("delete", "/api/v1/tags/{id}"),
    ("put", "/api/v1/books/{id}/tags"),
    ("post", "/api/v1/rooms"),
    ("patch", "/api/v1/rooms/{id}"),
    ("delete", "/api/v1/rooms/{id}"),
    ("get", "/api/v1/audit"),
    ("get", "/api/v1/audit/actions"),
    ("patch", "/api/v1/users/{id}"),
    ("delete", "/api/v1/users/{id}"),
    ("post", "/api/v1/users/{id}/owner"),
    ("get", "/api/v1/invites"),
    ("post", "/api/v1/invites"),
    ("delete", "/api/v1/invites/{id}"),
];

fn operations() -> Vec<(String, String, Value)> {
    let doc = serde_json::to_value(bookeeper_core::openapi()).unwrap();
    let mut out = Vec::new();
    for (path, item) in doc["paths"].as_object().unwrap() {
        for (method, op) in item.as_object().unwrap() {
            if ["get", "put", "post", "delete", "patch", "head", "options"]
                .contains(&method.as_str())
            {
                out.push((method.clone(), path.clone(), op.clone()));
            }
        }
    }
    out
}

fn has(op: &Value, status: &str) -> bool {
    op["responses"].get(status).is_some()
}

fn check(failures: Vec<String>) {
    assert!(failures.is_empty(), "\n{}", failures.join("\n"));
}

fn label(method: &str, path: &str) -> String {
    format!("{} {}", method.to_uppercase(), path)
}

#[test]
fn every_secured_operation_documents_401() {
    let mut bad = Vec::new();
    for (m, p, op) in operations() {
        let secured = op
            .get("security")
            .is_some_and(|s| !s.as_array().is_some_and(|a| a.is_empty()));
        if secured && !has(&op, "401") {
            bad.push(format!(
                "{} has security but no 401 response",
                label(&m, &p)
            ));
        }
    }
    check(bad);
}

#[test]
fn every_operation_documents_a_client_error() {
    let mut bad = Vec::new();
    for (m, p, op) in operations() {
        if NO_CLIENT_ERROR.contains(&(m.as_str(), p.as_str())) {
            continue;
        }
        let any = op["responses"]
            .as_object()
            .unwrap()
            .keys()
            .any(|k| k.starts_with('4'));
        if !any {
            bad.push(format!("{} documents no 4xx response", label(&m, &p)));
        }
    }
    check(bad);
}

#[test]
fn every_error_response_uses_the_error_body() {
    let mut bad = Vec::new();
    for (m, p, op) in operations() {
        for (status, resp) in op["responses"].as_object().unwrap() {
            if !(status.starts_with('4') || status.starts_with('5')) {
                continue;
            }
            let r = resp["content"]["application/json"]["schema"]["$ref"].as_str();
            if r != Some("#/components/schemas/ApiErrorBody") {
                bad.push(format!(
                    "{} response {} does not use ApiErrorBody as application/json",
                    label(&m, &p),
                    status
                ));
            }
        }
    }
    check(bad);
}

#[test]
fn every_operation_with_a_path_id_documents_404() {
    let mut bad = Vec::new();
    for (m, p, op) in operations() {
        if p.contains('{') && !has(&op, "404") {
            bad.push(format!(
                "{} has a path parameter but no 404 response",
                label(&m, &p)
            ));
        }
    }
    check(bad);
}

/// Operations passing through the attempt limiter (`limiter` in `api/*.rs`).
/// To update: `grep -n limiter crates/bookeeper-core/src/api/*.rs`.
const RATE_LIMITED: &[(&str, &str)] = &[
    ("post", "/api/v1/setup"),
    ("post", "/api/v1/auth/login"),
    ("post", "/api/v1/auth/libraries"),
    ("post", "/api/v1/auth/confirm"),
    ("post", "/api/v1/pairing/redeem"),
    ("post", "/api/v1/pairing/inspect"),
];

/// Fails for each listed operation that is missing or lacks `status`.
fn require_status(list: &[(&str, &str)], status: &str, why: &str) {
    let ops = operations();
    let mut bad = Vec::new();
    for (m, p) in list {
        match ops.iter().find(|(om, op, _)| om == m && op == p) {
            None => bad.push(format!("{} is not in the document", label(m, p))),
            Some((_, _, op)) if !has(op, status) => bad.push(format!(
                "{} is {} but has no {} response",
                label(m, p),
                why,
                status
            )),
            _ => {}
        }
    }
    check(bad);
}

#[test]
fn rate_limited_operations_document_429() {
    require_status(RATE_LIMITED, "429", "rate limited");
}

#[test]
fn role_gated_operations_document_403() {
    require_status(ROLE_GATED, "403", "role gated");
}

fn find_op(method: &str, path: &str) -> Value {
    operations()
        .into_iter()
        .find(|(m, p, _)| m == method && p == path)
        .unwrap_or_else(|| panic!("{} is not in the document", label(method, path)))
        .2
}

#[test]
fn json_operations_document_the_extractor_errors() {
    let mut bad = Vec::new();
    for (m, p, op) in operations() {
        if op["requestBody"]["content"]
            .get("application/json")
            .is_none()
        {
            continue;
        }
        for status in ["400", "413", "422"] {
            if !has(&op, status) {
                bad.push(format!(
                    "{} has a JSON body but no {} response",
                    label(&m, &p),
                    status
                ));
            }
        }
    }
    check(bad);
}

#[test]
fn refresh_documents_422() {
    assert!(has(&find_op("post", "/api/v1/auth/refresh"), "422"));
}

#[test]
fn server_public_url_is_required_and_nullable() {
    let doc = serde_json::to_value(bookeeper_core::openapi()).unwrap();
    let schema = &doc["components"]["schemas"]["ServerOut"];
    let required = schema["required"].as_array().expect("required list");
    assert!(required.iter().any(|v| v == "public_url"));
    let ty = &schema["properties"]["public_url"]["type"];
    let nullable = match ty {
        Value::Array(a) => a.iter().any(|v| v == "null"),
        _ => schema["properties"]["public_url"]["nullable"] == true,
    };
    assert!(nullable, "public_url must allow null: {schema}");
}

#[test]
fn explicit_responses_are_kept() {
    let op = find_op("post", "/api/v1/import");
    assert_eq!(
        op["responses"]["413"]["description"],
        "payload_too_large: body over 10 MB"
    );
}
