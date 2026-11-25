mod common;

use bookeeper_core::auth::Role;
use common::*;
use serde_json::{json, Value};

async fn req(s: &Seeded, method: &str, path: &str, body: Option<Value>) -> (u16, Value) {
    let (st, _, b) = call(&s.state, method, path, Some(&s.session.access_token), body).await;
    (st, b)
}

async fn tag(s: &Seeded, name: &str) -> Value {
    let (st, b) = req(s, "POST", "/api/v1/tags", Some(json!({"name": name}))).await;
    assert_eq!(st, 201, "{b}");
    b
}

fn id(v: &Value) -> String {
    v["id"].as_str().unwrap().to_string()
}

async fn assign(s: &Seeded, book: &str, ids: Value) -> (u16, Value) {
    req(
        s,
        "PUT",
        &format!("/api/v1/books/{book}/tags"),
        Some(json!({"tag_ids": ids})),
    )
    .await
}

fn names(b: &Value) -> Vec<String> {
    b["tags"]
        .as_array()
        .unwrap()
        .iter()
        .map(|t| t["name"].as_str().unwrap().to_string())
        .collect()
}

#[tokio::test]
async fn crud() {
    let s = seed(Role::Owner, None, None).await;
    let t = tag(&s, "  Fantasy ").await;
    assert_eq!(t["name"], "Fantasy");
    assert_eq!(t["color"], "sage");
    assert_eq!(t["book_count"], 0);
    let tid = id(&t);
    let (st, b) = req(
        &s,
        "PATCH",
        &format!("/api/v1/tags/{tid}"),
        Some(json!({"name": "Sci-fi", "color": "plum"})),
    )
    .await;
    assert_eq!(st, 200, "{b}");
    assert_eq!(
        (b["name"].as_str(), b["color"].as_str()),
        (Some("Sci-fi"), Some("plum"))
    );
    let (_, l) = req(&s, "GET", "/api/v1/tags", None).await;
    assert_eq!(l["items"].as_array().unwrap().len(), 1);
    let (st, _) = req(&s, "DELETE", &format!("/api/v1/tags/{tid}"), None).await;
    assert_eq!(st, 204);
    let (st, _) = req(&s, "DELETE", &format!("/api/v1/tags/{tid}"), None).await;
    assert_eq!(st, 404);
    let (st, _) = req(&s, "PATCH", &format!("/api/v1/tags/{tid}"), Some(json!({}))).await;
    assert_eq!(st, 404);
}

#[tokio::test]
async fn names_are_unique_ignoring_case_and_outer_spaces() {
    let s = seed(Role::Owner, None, None).await;
    let a = tag(&s, "Giallo").await;
    let (st, b) = req(
        &s,
        "POST",
        "/api/v1/tags",
        Some(json!({"name": " gIALLO "})),
    )
    .await;
    assert_eq!(
        (st, b["error_code"].as_str()),
        (409, Some("tag_exists")),
        "{b}"
    );
    let other = tag(&s, "Rosa").await;
    let (st, b) = req(
        &s,
        "PATCH",
        &format!("/api/v1/tags/{}", id(&other)),
        Some(json!({"name": "GIALLO"})),
    )
    .await;
    assert_eq!(
        (st, b["error_code"].as_str()),
        (409, Some("tag_exists")),
        "{b}"
    );
    // Renaming a tag to a different case of its own name is fine.
    let (st, b) = req(
        &s,
        "PATCH",
        &format!("/api/v1/tags/{}", id(&a)),
        Some(json!({"name": "GIALLO"})),
    )
    .await;
    assert_eq!(st, 200, "{b}");
}

#[tokio::test]
async fn validation() {
    let s = seed(Role::Owner, None, None).await;
    let cases = [
        json!({"name": ""}),
        json!({"name": "   "}),
        json!({"name": "x".repeat(41)}),
        json!({"name": "ok", "color": "pink"}),
    ];
    for c in cases {
        let (st, _) = req(&s, "POST", "/api/v1/tags", Some(c.clone())).await;
        assert_eq!(st, 422, "{c}");
    }
    tag(&s, &"x".repeat(40)).await;
    let t = tag(&s, "ok").await;
    for c in [
        json!({"name": ""}),
        json!({"color": "pink"}),
        json!({"name": null}),
        json!({"color": null}),
    ] {
        let (st, _) = req(&s, "PATCH", &format!("/api/v1/tags/{}", id(&t)), Some(c)).await;
        assert_eq!(st, 422);
    }
    for color in ["sage", "terracotta", "night", "plum", "amber", "graphite"] {
        let (st, _) = req(
            &s,
            "POST",
            "/api/v1/tags",
            Some(json!({"name": format!("c-{color}"), "color": color})),
        )
        .await;
        assert_eq!(st, 201);
    }
}

#[tokio::test]
async fn deleting_a_tag_keeps_the_books() {
    let s = seed(Role::Owner, None, None).await;
    let book = insert_book(&s.state, &s.library_id, "Dune").await;
    let t = tag(&s, "A").await;
    assert_eq!(assign(&s, &book, json!([id(&t)])).await.0, 200);
    req(&s, "DELETE", &format!("/api/v1/tags/{}", id(&t)), None).await;
    let (st, b) = req(&s, "GET", &format!("/api/v1/books/{book}"), None).await;
    assert_eq!(st, 200);
    assert!(b["tags"].as_array().unwrap().is_empty());
    let n: i64 = s
        .state
        .db
        .run(|c| c.query_row("SELECT COUNT(*) FROM book_tags", [], |r| r.get(0)))
        .await
        .unwrap();
    assert_eq!(n, 0);
}

#[tokio::test]
async fn put_replaces_clears_and_dedupes() {
    let s = seed(Role::Owner, None, None).await;
    let book = insert_book(&s.state, &s.library_id, "Dune").await;
    let (a, b, c) = (tag(&s, "b").await, tag(&s, "a").await, tag(&s, "c").await);
    let (st, out) = assign(&s, &book, json!([id(&a), id(&b), id(&a)])).await;
    assert_eq!(st, 200, "{out}");
    assert_eq!(names(&out), ["a", "b"]);
    let (_, out) = assign(&s, &book, json!([id(&c)])).await;
    assert_eq!(names(&out), ["c"]);
    let (_, l) = req(&s, "GET", "/api/v1/tags", None).await;
    let counts: Vec<(String, i64)> = l["items"]
        .as_array()
        .unwrap()
        .iter()
        .map(|t| {
            (
                t["name"].as_str().unwrap().into(),
                t["book_count"].as_i64().unwrap(),
            )
        })
        .collect();
    assert_eq!(counts, [("a".into(), 0), ("b".into(), 0), ("c".into(), 1)]);
    let (st, out) = assign(&s, &book, json!([])).await;
    assert_eq!(st, 200);
    assert!(names(&out).is_empty());
}

#[tokio::test]
async fn put_limit_counts_distinct_ids() {
    let s = seed(Role::Owner, None, None).await;
    let book = insert_book(&s.state, &s.library_id, "Dune").await;
    let mut ids = Vec::new();
    for i in 0..21 {
        ids.push(id(&tag(&s, &format!("t{i:02}")).await));
    }
    assert_eq!(assign(&s, &book, json!(ids)).await.0, 422);
    assert_eq!(assign(&s, &book, json!(&ids[..20])).await.0, 200);
    // Repeated ids count once: 20 distinct + a repeat is accepted.
    let mut rep = ids[..20].to_vec();
    rep.push(ids[0].clone());
    assert_eq!(assign(&s, &book, json!(rep)).await.0, 200);
}

#[tokio::test]
async fn put_with_foreign_or_unknown_tag_changes_nothing() {
    let s = seed(Role::Owner, None, None).await;
    let book = insert_book(&s.state, &s.library_id, "Dune").await;
    let mine = tag(&s, "mine").await;
    assert_eq!(assign(&s, &book, json!([id(&mine)])).await.0, 200);
    let (_, other) = other_library(&s.state).await;
    let (st, foreign) = call(
        &s.state,
        "POST",
        "/api/v1/tags",
        Some(&other.access_token),
        Some(json!({"name": "theirs"})),
    )
    .await
    .pipe();
    assert_eq!(st, 201);
    let before = audit_rows(&s.state, &s.library_id).await.len();
    for bad in [id(&foreign), "nope".to_string()] {
        let (st, _) = assign(&s, &book, json!([bad])).await;
        assert_eq!(st, 404);
        let (st, _) = assign(&s, &book, json!([id(&mine), bad])).await;
        assert_eq!(st, 404);
    }
    let (_, b) = req(&s, "GET", &format!("/api/v1/books/{book}"), None).await;
    assert_eq!(names(&b), ["mine"]);
    assert_eq!(audit_rows(&s.state, &s.library_id).await.len(), before);
    let (st, _) = assign(&s, "missing", json!([])).await;
    assert_eq!(st, 404);
}

trait Pipe {
    fn pipe(self) -> (u16, Value);
}
impl Pipe for (u16, axum::http::HeaderMap, Value) {
    fn pipe(self) -> (u16, Value) {
        (self.0, self.2)
    }
}

#[tokio::test]
async fn book_count_counts_books() {
    let s = seed(Role::Owner, None, None).await;
    let t = tag(&s, "A").await;
    for title in ["x", "y", "z"] {
        let book = insert_book(&s.state, &s.library_id, title).await;
        assign(&s, &book, json!([id(&t)])).await;
    }
    let (_, l) = req(&s, "GET", "/api/v1/tags", None).await;
    assert_eq!(l["items"][0]["book_count"], 3);
}

#[tokio::test]
async fn guest_cannot_write_but_can_read() {
    let s = seed(Role::Owner, None, None).await;
    let t = tag(&s, "A").await;
    let book = insert_book(&s.state, &s.library_id, "x").await;
    let (_, g) = add_user(&s.state, &s.library_id, Role::Guest, "Gus").await;
    let tok = g.access_token;
    let calls = [
        (
            "POST",
            "/api/v1/tags".to_string(),
            Some(json!({"name": "B"})),
        ),
        (
            "PATCH",
            format!("/api/v1/tags/{}", id(&t)),
            Some(json!({"name": "B"})),
        ),
        ("DELETE", format!("/api/v1/tags/{}", id(&t)), None),
        (
            "PUT",
            format!("/api/v1/books/{book}/tags"),
            Some(json!({"tag_ids": []})),
        ),
    ];
    for (m, p, b) in calls {
        let (st, _, _) = call(&s.state, m, &p, Some(&tok), b).await;
        assert_eq!(st, 403, "{m} {p}");
    }
    let (st, _, _) = call(&s.state, "GET", "/api/v1/tags", Some(&tok), None).await;
    assert_eq!(st, 200);
}

#[tokio::test]
async fn libraries_are_isolated() {
    let s = seed(Role::Owner, None, None).await;
    let t = tag(&s, "A").await;
    let (_, other) = other_library(&s.state).await;
    let tok = Some(other.access_token.as_str());
    let (_, _, l) = call(&s.state, "GET", "/api/v1/tags", tok, None).await;
    assert!(l["items"].as_array().unwrap().is_empty());
    let p = format!("/api/v1/tags/{}", id(&t));
    let (st, _, _) = call(&s.state, "PATCH", &p, tok, Some(json!({"name": "Z"}))).await;
    assert_eq!(st, 404);
    let (st, _, _) = call(&s.state, "DELETE", &p, tok, None).await;
    assert_eq!(st, 404);
    // The same name is free in another library.
    let (st, _, _) = call(
        &s.state,
        "POST",
        "/api/v1/tags",
        tok,
        Some(json!({"name": "A"})),
    )
    .await;
    assert_eq!(st, 201);
    let book = insert_book(&s.state, &s.library_id, "x").await;
    let (st, _, _) = call(
        &s.state,
        "PUT",
        &format!("/api/v1/books/{book}/tags"),
        tok,
        Some(json!({"tag_ids": []})),
    )
    .await;
    assert_eq!(st, 404);
}

#[tokio::test]
async fn writes_are_audited() {
    let s = seed(Role::Owner, None, None).await;
    let t = tag(&s, "A").await;
    let book = insert_book(&s.state, &s.library_id, "x").await;
    req(
        &s,
        "PATCH",
        &format!("/api/v1/tags/{}", id(&t)),
        Some(json!({"color": "amber"})),
    )
    .await;
    assign(&s, &book, json!([id(&t)])).await;
    req(&s, "DELETE", &format!("/api/v1/tags/{}", id(&t)), None).await;
    let rows = audit_rows(&s.state, &s.library_id).await;
    let got: Vec<(&str, &str)> = rows.iter().map(|r| (r.0.as_str(), r.1.as_str())).collect();
    assert_eq!(
        got,
        [
            ("tag.create", "tag"),
            ("tag.update", "tag"),
            ("book.tags", "book"),
            ("tag.delete", "tag")
        ]
    );
}
