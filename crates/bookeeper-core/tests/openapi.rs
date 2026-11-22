#[test]
fn spec_documents_health() {
    let spec = serde_json::to_value(bookeeper_core::openapi()).unwrap();
    assert_eq!(spec["info"]["title"], "Bookeeper API");
    assert!(spec["paths"]["/api/v1/health"]["get"].is_object());
    assert!(spec["components"]["schemas"]["Health"].is_object());
    assert!(spec["components"]["schemas"]["ApiErrorBody"].is_object());
}

#[test]
fn committed_snapshot_is_current() {
    let path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../packages/api/openapi.json"
    );
    let fresh = serde_json::to_string_pretty(&bookeeper_core::openapi()).unwrap() + "\n";
    if std::env::var("UPDATE_OPENAPI").is_ok() {
        std::fs::write(path, &fresh).unwrap();
    }
    assert_eq!(
        std::fs::read_to_string(path).unwrap(),
        fresh,
        "run: UPDATE_OPENAPI=1 cargo test -p bookeeper-core --test openapi"
    );
}
