mod common;

use bookeeper_core::auth::Role;
use common::*;
use serde_json::{json, Value};

async fn req(s: &Seeded, method: &str, path: &str, body: Option<Value>) -> (u16, Value) {
    let (st, _, b) = call(&s.state, method, path, Some(&s.session.access_token), body).await;
    (st, b)
}

async fn room(s: &Seeded, name: &str) -> Value {
    let (st, b) = req(s, "POST", "/api/v1/rooms", Some(json!({"name": name}))).await;
    assert_eq!(st, 201, "{b}");
    b
}

fn id(v: &Value) -> String {
    v["id"].as_str().unwrap().to_string()
}

async fn shelf_in(s: &Seeded, name: &str, room_id: &str) -> Value {
    let (st, b) = req(
        s,
        "POST",
        "/api/v1/shelves",
        Some(json!({"name": name, "rows": 2, "slots_per_row": 5, "room_id": room_id})),
    )
    .await;
    assert_eq!(st, 201, "{b}");
    b
}

#[tokio::test]
async fn crud() {
    let s = seed(Role::Owner, None, None).await;
    let r = room(&s, "  Salotto ").await;
    assert_eq!(r["name"], "Salotto");
    assert_eq!(r["shelf_count"], 0);
    assert!(r["created_at"].as_i64().unwrap() > 0);
    let rid = id(&r);
    let (st, b) = req(
        &s,
        "PATCH",
        &format!("/api/v1/rooms/{rid}"),
        Some(json!({"name": "Studio"})),
    )
    .await;
    assert_eq!(st, 200, "{b}");
    assert_eq!(b["name"], "Studio");
    let (st, b) = req(
        &s,
        "PATCH",
        &format!("/api/v1/rooms/{rid}"),
        Some(json!({})),
    )
    .await;
    assert_eq!((st, b["name"].as_str()), (200, Some("Studio")));
    let (st, _) = req(
        &s,
        "PATCH",
        &format!("/api/v1/rooms/{rid}"),
        Some(json!({"name": null})),
    )
    .await;
    assert_eq!(st, 422);
    room(&s, "Atrio").await;
    let (st, l) = req(&s, "GET", "/api/v1/rooms", None).await;
    assert_eq!(st, 200);
    let names: Vec<&str> = l["items"]
        .as_array()
        .unwrap()
        .iter()
        .map(|r| r["name"].as_str().unwrap())
        .collect();
    assert_eq!(names, ["Atrio", "Studio"]);
    let (st, _) = req(&s, "DELETE", &format!("/api/v1/rooms/{rid}"), None).await;
    assert_eq!(st, 204);
    let (st, _) = req(&s, "DELETE", &format!("/api/v1/rooms/{rid}"), None).await;
    assert_eq!(st, 404);
    let (st, _) = req(
        &s,
        "PATCH",
        &format!("/api/v1/rooms/{rid}"),
        Some(json!({"name": "x"})),
    )
    .await;
    assert_eq!(st, 404);
}

#[tokio::test]
async fn duplicate_name_is_a_conflict() {
    let s = seed(Role::Owner, None, None).await;
    let a = room(&s, "Salotto").await;
    for dup in ["Salotto", " salotto "] {
        let (st, b) = req(&s, "POST", "/api/v1/rooms", Some(json!({"name": dup}))).await;
        assert_eq!(st, 409, "{b}");
        assert_eq!(b["error_code"], "room_exists");
    }
    let b = room(&s, "Studio").await;
    let (st, e) = req(
        &s,
        "PATCH",
        &format!("/api/v1/rooms/{}", id(&b)),
        Some(json!({"name": "Salotto"})),
    )
    .await;
    assert_eq!((st, e["error_code"].as_str()), (409, Some("room_exists")));
    // Renaming to its own name is fine.
    let (st, _) = req(
        &s,
        "PATCH",
        &format!("/api/v1/rooms/{}", id(&a)),
        Some(json!({"name": "Salotto"})),
    )
    .await;
    assert_eq!(st, 200);
}

#[tokio::test]
async fn name_length_is_validated() {
    let s = seed(Role::Owner, None, None).await;
    for bad in ["", "   ", &"x".repeat(61)] {
        let (st, b) = req(&s, "POST", "/api/v1/rooms", Some(json!({"name": bad}))).await;
        assert_eq!(st, 422, "{b}");
    }
    let ok = room(&s, &"x".repeat(60)).await;
    let (st, _) = req(
        &s,
        "PATCH",
        &format!("/api/v1/rooms/{}", id(&ok)),
        Some(json!({"name": ""})),
    )
    .await;
    assert_eq!(st, 422);
}

#[tokio::test]
async fn deleting_a_room_keeps_its_shelves() {
    let s = seed(Role::Owner, None, None).await;
    let r = room(&s, "Salotto").await;
    let sh = shelf_in(&s, "A", &id(&r)).await;
    assert_eq!(sh["room"], json!({"id": id(&r), "name": "Salotto"}));
    let (st, _) = req(&s, "DELETE", &format!("/api/v1/rooms/{}", id(&r)), None).await;
    assert_eq!(st, 204);
    let (st, b) = req(&s, "GET", &format!("/api/v1/shelves/{}", id(&sh)), None).await;
    assert_eq!(st, 200, "{b}");
    assert_eq!(b["room_id"], Value::Null);
    assert_eq!(b["room"], Value::Null);
    assert_eq!(b["name"], "A");
}

#[tokio::test]
async fn shelf_count_counts_shelves() {
    let s = seed(Role::Owner, None, None).await;
    let a = room(&s, "A").await;
    room(&s, "B").await;
    shelf_in(&s, "1", &id(&a)).await;
    shelf_in(&s, "2", &id(&a)).await;
    let (_, l) = req(&s, "GET", "/api/v1/rooms", None).await;
    let counts: Vec<(&str, i64)> = l["items"]
        .as_array()
        .unwrap()
        .iter()
        .map(|r| {
            (
                r["name"].as_str().unwrap(),
                r["shelf_count"].as_i64().unwrap(),
            )
        })
        .collect();
    assert_eq!(counts, [("A", 2), ("B", 0)]);
}

#[tokio::test]
async fn guest_cannot_write_but_can_read() {
    let s = seed(Role::Owner, None, None).await;
    let r = room(&s, "A").await;
    let (_, g) = add_user(&s.state, &s.library_id, Role::Guest, "Gus").await;
    let tok = g.access_token;
    let calls = [
        (
            "POST",
            "/api/v1/rooms".to_string(),
            Some(json!({"name": "B"})),
        ),
        (
            "PATCH",
            format!("/api/v1/rooms/{}", id(&r)),
            Some(json!({"name": "B"})),
        ),
        ("DELETE", format!("/api/v1/rooms/{}", id(&r)), None),
    ];
    for (m, p, b) in calls {
        let (st, _, _) = call(&s.state, m, &p, Some(&tok), b).await;
        assert_eq!(st, 403, "{m} {p}");
    }
    let (st, _, l) = call(&s.state, "GET", "/api/v1/rooms", Some(&tok), None).await;
    assert_eq!(st, 200);
    assert_eq!(l["items"].as_array().unwrap().len(), 1);
}

#[tokio::test]
async fn libraries_are_isolated() {
    let s = seed(Role::Owner, None, None).await;
    let r = room(&s, "A").await;
    let (_, other) = other_library(&s.state).await;
    let tok = Some(other.access_token.as_str());
    let (_, _, l) = call(&s.state, "GET", "/api/v1/rooms", tok, None).await;
    assert!(l["items"].as_array().unwrap().is_empty());
    let p = format!("/api/v1/rooms/{}", id(&r));
    let (st, _, _) = call(&s.state, "PATCH", &p, tok, Some(json!({"name": "Z"}))).await;
    assert_eq!(st, 404);
    let (st, _, _) = call(&s.state, "DELETE", &p, tok, None).await;
    assert_eq!(st, 404);
    // The same name is free in another library.
    let (st, _, _) = call(
        &s.state,
        "POST",
        "/api/v1/rooms",
        tok,
        Some(json!({"name": "A"})),
    )
    .await;
    assert_eq!(st, 201);
    let (_, l) = req(&s, "GET", "/api/v1/rooms", None).await;
    assert_eq!(l["items"][0]["shelf_count"], 0);
    assert_eq!(l["items"].as_array().unwrap().len(), 1);
}

#[tokio::test]
async fn writes_are_audited() {
    let s = seed(Role::Owner, None, None).await;
    let r = room(&s, "A").await;
    req(
        &s,
        "PATCH",
        &format!("/api/v1/rooms/{}", id(&r)),
        Some(json!({"name": "B"})),
    )
    .await;
    req(&s, "DELETE", &format!("/api/v1/rooms/{}", id(&r)), None).await;
    // Failed writes leave no trace.
    req(&s, "DELETE", &format!("/api/v1/rooms/{}", id(&r)), None).await;
    let rows = audit_rows(&s.state, &s.library_id).await;
    let got: Vec<(&str, &str)> = rows.iter().map(|r| (r.0.as_str(), r.1.as_str())).collect();
    assert_eq!(
        got,
        [
            ("room.create", "room"),
            ("room.update", "room"),
            ("room.delete", "room")
        ]
    );
    assert!(rows.iter().all(|row| row.2 == id(&r)));
}
