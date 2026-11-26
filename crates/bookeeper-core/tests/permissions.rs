//! The permission matrix of the "Ruoli" table in `docs/forge/fase-6a/CONTRATTO.md`.
//!
//! One representative request per group of routes, for each of the four roles. The table says
//! the lowest role that may do it: anyone below must get 403 `forbidden`, anyone at or above
//! must NOT get 403 (nor 401: the token is good). A route that disagrees with the table is
//! reported, never fixed here.

mod common;

use bookeeper_core::auth::{Role, Session};
use bookeeper_core::AppState;
use common::{add_user, call, insert_book, insert_shelf, seed};
use serde_json::{json, Value};

const ROLES: [Role; 4] = [Role::Guest, Role::Member, Role::Admin, Role::Owner];

/// Ids a request may need; every row has its own book, and its own people, so rows cannot
/// disturb each other.
struct Fx {
    books: Vec<String>,
    shelf: String,
    /// A member of the library with a device: (user id, session).
    people: Vec<(String, Session)>,
}

type Build = fn(&Fx, usize) -> (&'static str, String, Option<Value>);

struct Row {
    name: &'static str,
    min: Role,
    /// The owner (who has no confirmation token here) may legitimately get a 401 from it.
    needs_confirm: bool,
    build: Build,
}

fn row(name: &'static str, min: Role, build: Build) -> Row {
    Row {
        name,
        min,
        needs_confirm: false,
        build,
    }
}

fn table() -> Vec<Row> {
    vec![
        // Reads.
        row("read books", Role::Guest, |_, _| {
            ("GET", "/api/v1/books".into(), None)
        }),
        row("read shelves", Role::Guest, |_, _| {
            ("GET", "/api/v1/shelves".into(), None)
        }),
        row("read loans", Role::Guest, |_, _| {
            ("GET", "/api/v1/loans".into(), None)
        }),
        row("read people", Role::Guest, |_, _| {
            ("GET", "/api/v1/users".into(), None)
        }),
        row("read family wishlist", Role::Guest, |_, _| {
            ("GET", "/api/v1/wishlist".into(), None)
        }),
        // Writes.
        row("write books", Role::Member, |_, i| {
            (
                "POST",
                "/api/v1/books".into(),
                Some(json!({"title": format!("Libro {i}"), "authors": []})),
            )
        }),
        row("write covers", Role::Member, |f, i| {
            ("PUT", format!("/api/v1/books/{}/cover", f.books[i]), None)
        }),
        row("write placements", Role::Member, |f, i| {
            (
                "PUT",
                format!("/api/v1/books/{}/placement", f.books[i]),
                Some(json!({"shelf_id": f.shelf, "row_index": 0, "slot_index": i})),
            )
        }),
        row("write shelves", Role::Member, |_, i| {
            (
                "POST",
                "/api/v1/shelves".into(),
                Some(json!({"name": format!("Scaffale {i}"), "rows": 3, "slots_per_row": 10})),
            )
        }),
        row("write rooms", Role::Member, |_, i| {
            (
                "POST",
                "/api/v1/rooms".into(),
                Some(json!({"name": format!("Stanza {i}")})),
            )
        }),
        row("write tags", Role::Member, |_, i| {
            (
                "POST",
                "/api/v1/tags".into(),
                Some(json!({"name": format!("tag{i}")})),
            )
        }),
        row("write loans", Role::Member, |f, i| {
            (
                "POST",
                "/api/v1/loans".into(),
                Some(json!({"book_id": f.books[i], "borrower_name": "Mario"})),
            )
        }),
        row("write own wishlist", Role::Member, |_, i| {
            (
                "POST",
                "/api/v1/wishlist".into(),
                Some(json!({"title": format!("Desiderio {i}")})),
            )
        }),
        row("write own reading state", Role::Guest, |f, i| {
            (
                "PUT",
                format!("/api/v1/books/{}/reading", f.books[i]),
                Some(json!({"status": "read"})),
            )
        }),
        // Export and devices.
        row("export", Role::Member, |_, _| {
            ("GET", "/api/v1/export".into(), None)
        }),
        row("device code", Role::Member, |_, _| {
            ("POST", "/api/v1/pairing/codes".into(), None)
        }),
        row("revoke someone else's device", Role::Admin, |f, i| {
            let device = &f.people[i].1.device_id;
            ("POST", format!("/api/v1/devices/{device}/revoke"), None)
        }),
        // People.
        row("create invite", Role::Admin, |_, _| {
            (
                "POST",
                "/api/v1/invites".into(),
                Some(json!({"role": "member"})),
            )
        }),
        row("list invites", Role::Admin, |_, _| {
            ("GET", "/api/v1/invites".into(), None)
        }),
        row("change a role", Role::Admin, |f, i| {
            (
                "PATCH",
                format!("/api/v1/users/{}", f.people[i].0),
                Some(json!({"role": "guest"})),
            )
        }),
        row("remove a person", Role::Admin, |f, i| {
            ("DELETE", format!("/api/v1/users/{}", f.people[i].0), None)
        }),
        // Admin tools.
        row("import", Role::Admin, |_, _| {
            (
                "POST",
                "/api/v1/import".into(),
                Some(json!({"content": "", "dry_run": true})),
            )
        }),
        row("backup", Role::Admin, |_, _| {
            ("POST", "/api/v1/backup".into(), None)
        }),
        row("activity log", Role::Admin, |_, _| {
            ("GET", "/api/v1/audit".into(), None)
        }),
        // Owner only.
        Row {
            name: "restore",
            min: Role::Owner,
            needs_confirm: true,
            build: |_, _| ("POST", "/api/v1/restore".into(), None),
        },
        // Last: for the owner it really hands the library over.
        row("transfer ownership", Role::Owner, |f, i| {
            (
                "POST",
                format!("/api/v1/users/{}/owner", f.people[i].0),
                None,
            )
        }),
    ]
}

async fn library_for(role: Role, rows: usize) -> (AppState, Session, Fx) {
    let s = seed(role, None, None).await;
    let mut books = Vec::new();
    let mut people = Vec::new();
    for i in 0..rows {
        books.push(insert_book(&s.state, &s.library_id, &format!("Libro {i}")).await);
        people.push(
            add_user(
                &s.state,
                &s.library_id,
                Role::Member,
                &format!("Persona {i}"),
            )
            .await,
        );
    }
    let shelf = insert_shelf(&s.state, &s.library_id, "Salotto", 3, 60).await;
    (
        s.state,
        s.session,
        Fx {
            books,
            shelf,
            people,
        },
    )
}

#[tokio::test]
async fn the_matrix_follows_the_roles_table() {
    let table = table();
    let mut wrong: Vec<String> = Vec::new();
    for role in ROLES {
        let (state, session, fx) = library_for(role, table.len()).await;
        for (i, r) in table.iter().enumerate() {
            let (method, path, body) = (r.build)(&fx, i);
            let (status, _, _) =
                call(&state, method, &path, Some(&session.access_token), body).await;
            let allowed = role.at_least(r.min);
            let ok = if allowed {
                status != 403 && (status != 401 || r.needs_confirm) && status < 500
            } else {
                status == 403
            };
            if !ok {
                wrong.push(format!(
                    "{role:?} {method} {path} ({}): got {status}, expected {}",
                    r.name,
                    if allowed { "anything but 403" } else { "403" }
                ));
            }
        }
    }
    assert!(
        wrong.is_empty(),
        "routes off the table:\n{}",
        wrong.join("\n")
    );
}

#[tokio::test]
async fn listing_devices_shows_other_peoples_only_to_admins() {
    for role in ROLES {
        let (state, session, fx) = library_for(role, 1).await;
        let (st, _, body) = call(
            &state,
            "GET",
            "/api/v1/devices",
            Some(&session.access_token),
            None,
        )
        .await;
        assert_eq!(st, 200);
        let other = &fx.people[0].1.device_id;
        let sees_other = body["devices"]
            .as_array()
            .unwrap()
            .iter()
            .any(|d| d["id"] == other.as_str());
        assert_eq!(sees_other, role.at_least(Role::Admin), "{role:?}");
        let (st, _, _) = call(
            &state,
            "PATCH",
            &format!("/api/v1/devices/{other}"),
            Some(&session.access_token),
            Some(json!({"name": "Altro"})),
        )
        .await;
        assert_eq!(st == 200, role.at_least(Role::Admin), "{role:?} rename");
    }
}
