mod common;

use axum::{routing::get, Router};
use bookeeper_core::api::util::{new_id, normalize_isbn10, normalize_isbn13, ApiQuery, Page};
use bookeeper_core::audit;
use bookeeper_core::auth::guard::AuthUser;
use bookeeper_core::auth::Role;
use common::*;
use serde_json::json;
use tower::ServiceExt;

fn who(s: &Seeded) -> AuthUser {
    AuthUser {
        library_id: s.library_id.clone(),
        user_id: s.user_id.clone(),
        device_id: "dev-1".into(),
        role: Role::Owner,
    }
}

#[tokio::test]
async fn audit_record_writes_who_what_and_when() {
    let s = seed(Role::Owner, None, None).await;
    let w = who(&s);
    let w2 = w.clone_for_test();
    s.state
        .db
        .run(move |conn| {
            audit::record(
                conn,
                &w2,
                "book.create",
                "book",
                "b1",
                Some(&json!({"a": 1})),
                1234,
            )?;
            audit::record(conn, &w2, "book.delete", "book", "b1", None, 1235)
        })
        .await
        .unwrap();
    let rows = s
        .state
        .db
        .run(|conn| {
            let mut st = conn.prepare(
                "SELECT library_id, user_id, device_id, action, entity_type, entity_id, \
                 detail_json, ip, at FROM audit_log ORDER BY id",
            )?;
            let r = st.query_map([], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, String>(3)?,
                    r.get::<_, String>(4)?,
                    r.get::<_, String>(5)?,
                    r.get::<_, Option<String>>(6)?,
                    r.get::<_, Option<String>>(7)?,
                    r.get::<_, i64>(8)?,
                ))
            })?;
            r.collect::<rusqlite::Result<Vec<_>>>()
        })
        .await
        .unwrap();
    assert_eq!(rows.len(), 2);
    let r = &rows[0];
    assert_eq!(r.0, s.library_id);
    assert_eq!(r.1, s.user_id);
    assert_eq!(r.2, "dev-1");
    assert_eq!(
        (r.3.as_str(), r.4.as_str(), r.5.as_str()),
        ("book.create", "book", "b1")
    );
    assert_eq!(
        serde_json::from_str::<serde_json::Value>(r.6.as_deref().unwrap()).unwrap(),
        json!({"a": 1})
    );
    assert_eq!(r.7, None);
    assert_eq!(r.8, 1234);
    assert_eq!(rows[1].6, None);
}

trait CloneForTest {
    fn clone_for_test(&self) -> AuthUser;
}
impl CloneForTest for AuthUser {
    fn clone_for_test(&self) -> AuthUser {
        AuthUser {
            library_id: self.library_id.clone(),
            user_id: self.user_id.clone(),
            device_id: self.device_id.clone(),
            role: self.role,
        }
    }
}

#[tokio::test]
async fn audit_record_inside_a_rolled_back_transaction_leaves_nothing() {
    let s = seed(Role::Owner, None, None).await;
    let w = who(&s);
    s.state
        .db
        .run(move |conn| {
            let tx = conn.transaction()?;
            audit::record(&tx, &w, "x", "book", "b1", None, 1)?;
            tx.rollback()
        })
        .await
        .unwrap();
    assert!(audit_rows(&s.state, &s.library_id).await.is_empty());
}

#[derive(serde::Deserialize)]
struct Q {
    #[serde(flatten)]
    page: Page,
}

async fn probe(ApiQuery(q): ApiQuery<Q>) -> String {
    format!("{:?}", q.page.resolve().is_ok())
}

#[tokio::test]
async fn api_query_rejections_are_validation() {
    let app = Router::new().route("/p", get(probe));
    let resp = app
        .oneshot(
            axum::http::Request::builder()
                .uri("/p?limit=abc")
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(resp.status().as_u16(), 422);
    assert!(resp
        .headers()
        .get("content-type")
        .unwrap()
        .to_str()
        .unwrap()
        .starts_with("application/json"));
    use http_body_util::BodyExt;
    let b = resp.into_body().collect().await.unwrap().to_bytes();
    let v: serde_json::Value = serde_json::from_slice(&b).unwrap();
    assert_eq!(v["error_code"], "validation");
}

#[test]
fn page_defaults_and_bounds() {
    let p = |limit, offset| Page { limit, offset };
    assert_eq!(p(None, None).resolve().unwrap(), (50, 0));
    assert_eq!(p(Some(200), None).resolve().unwrap(), (200, 0));
    assert_eq!(p(Some(1), Some(5)).resolve().unwrap(), (1, 5));
    for bad in [p(Some(0), None), p(Some(201), None), p(None, Some(-1))] {
        assert_eq!(bad.resolve().unwrap_err().code, "validation");
    }
}

#[test]
fn isbn13_checksum() {
    assert_eq!(
        normalize_isbn13("978-0-306-40615-7").as_deref(),
        Some("9780306406157")
    );
    assert_eq!(normalize_isbn13("978-0-306-40615-8"), None);
    assert_eq!(normalize_isbn13("978030640615"), None);
}

#[test]
fn isbn10_checksum() {
    assert_eq!(
        normalize_isbn10("0-306-40615-2").as_deref(),
        Some("0306406152")
    );
    assert_eq!(
        normalize_isbn10("080442957X").as_deref(),
        Some("080442957X")
    );
    assert_eq!(
        normalize_isbn10("080442957x").as_deref(),
        Some("080442957X")
    );
    assert_eq!(normalize_isbn10("0-306-40615-3"), None);
}

#[test]
fn new_id_is_a_uuid_v7_and_sortable() {
    let (a, b) = (new_id(), new_id());
    assert_ne!(a, b);
    assert!(b >= a);
    assert_eq!(uuid::Uuid::parse_str(&a).unwrap().get_version_num(), 7);
}

#[tokio::test]
async fn helpers_work() {
    let s = seed(Role::Owner, None, None).await;
    let b = insert_book(&s.state, &s.library_id, "Dune").await;
    let n: i64 = {
        let id = b.clone();
        s.state
            .db
            .run(move |c| {
                c.query_row("SELECT COUNT(*) FROM books WHERE id = ?1", [id], |r| {
                    r.get(0)
                })
            })
            .await
            .unwrap()
    };
    assert_eq!(n, 1);
    let s1 = insert_shelf(&s.state, &s.library_id, "A", 3, 10).await;
    let s2 = insert_shelf(&s.state, &s.library_id, "B", 3, 10).await;
    let codes: Vec<i64> = s
        .state
        .db
        .run(move |c| {
            let mut st = c.prepare(
                "SELECT label_code FROM shelves WHERE id IN (?1, ?2) ORDER BY label_code",
            )?;
            let r = st.query_map([s1, s2], |r| r.get(0))?;
            r.collect::<rusqlite::Result<Vec<_>>>()
        })
        .await
        .unwrap();
    assert_eq!(codes, vec![1, 2]);
    let (lib2, sess2) = other_library(&s.state).await;
    assert_ne!(lib2, s.library_id);
    assert!(!sess2.access_token.is_empty());
    assert!(audit_rows(&s.state, &s.library_id).await.is_empty());
}

#[tokio::test]
async fn empty_modules_are_mounted() {
    let s = seed(Role::Owner, None, None).await;
    let (status, _, body) = call(
        &s.state,
        "GET",
        "/api/v1/books",
        Some(&s.session.access_token),
        None,
    )
    .await;
    assert_eq!(status, 404);
    assert_eq!(body["error_code"], "not_found");
    let _ = bookeeper_core::openapi();
}
