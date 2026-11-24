mod common;

use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Duration;

use bookeeper_core::auth::Role;
use bookeeper_core::lookup::{LookupService, Metadata, Provider, ProviderError};
use common::*;

const ISBN: &str = "9780306406157";
const DAY: i64 = 24 * 3600;

enum Behavior {
    Found(Metadata),
    Nothing,
    Fail,
    Hang,
    Delay(Duration, Metadata),
}

struct Fake {
    name: &'static str,
    behavior: Behavior,
    calls: Arc<AtomicUsize>,
}

#[async_trait::async_trait]
impl Provider for Fake {
    fn name(&self) -> &'static str {
        self.name
    }
    async fn lookup(&self, _isbn: &str) -> Result<Option<Metadata>, ProviderError> {
        self.calls.fetch_add(1, Ordering::SeqCst);
        match &self.behavior {
            Behavior::Found(m) => Ok(Some(m.clone())),
            Behavior::Nothing => Ok(None),
            Behavior::Fail => Err(ProviderError("boom".into())),
            Behavior::Hang => std::future::pending().await,
            Behavior::Delay(d, m) => {
                tokio::time::sleep(*d).await;
                Ok(Some(m.clone()))
            }
        }
    }
}

fn fake(name: &'static str, behavior: Behavior) -> (Arc<dyn Provider>, Arc<AtomicUsize>) {
    let calls = Arc::new(AtomicUsize::new(0));
    (
        Arc::new(Fake {
            name,
            behavior,
            calls: calls.clone(),
        }),
        calls,
    )
}

fn meta(title: &str) -> Metadata {
    Metadata {
        title: Some(title.into()),
        ..Default::default()
    }
}

fn svc(ps: Vec<Arc<dyn Provider>>) -> LookupService {
    LookupService::with_providers(ps)
}

#[tokio::test]
async fn first_non_empty_field_wins_in_provider_order() {
    let (a, _) = fake(
        "a",
        Behavior::Delay(
            Duration::from_millis(60),
            Metadata {
                title: Some("A".into()),
                publisher: Some("".into()),
                ..Default::default()
            },
        ),
    );
    let (b, _) = fake(
        "b",
        Behavior::Found(Metadata {
            title: Some("B".into()),
            publisher: Some("Pub B".into()),
            page_count: Some(100),
            ..Default::default()
        }),
    );
    let m = svc(vec![a, b]).lookup(ISBN, false, 0).await.unwrap();
    assert_eq!(m.title.as_deref(), Some("A"));
    assert_eq!(m.publisher.as_deref(), Some("Pub B"));
    assert_eq!(m.page_count, Some(100));
}

#[tokio::test]
async fn authors_come_from_the_first_non_empty_list() {
    let (a, _) = fake("a", Behavior::Found(meta("T")));
    let (b, _) = fake(
        "b",
        Behavior::Found(Metadata {
            authors: vec!["Bea".into()],
            ..Default::default()
        }),
    );
    let (c, _) = fake(
        "c",
        Behavior::Found(Metadata {
            authors: vec!["Cid".into(), "Dan".into()],
            ..Default::default()
        }),
    );
    let m = svc(vec![a, b, c]).lookup(ISBN, false, 0).await.unwrap();
    assert_eq!(m.authors, vec!["Bea".to_string()]);
}

#[tokio::test]
async fn cover_candidates_are_merged_deduplicated_and_https_only() {
    let (a, _) = fake(
        "a",
        Behavior::Found(Metadata {
            title: Some("T".into()),
            cover_candidates: vec!["https://x/1".into(), "http://x/2".into()],
            ..Default::default()
        }),
    );
    let (b, _) = fake(
        "b",
        Behavior::Found(Metadata {
            cover_candidates: vec!["https://x/3".into(), "https://x/1".into()],
            ..Default::default()
        }),
    );
    let m = svc(vec![a, b]).lookup(ISBN, false, 0).await.unwrap();
    assert_eq!(m.cover_candidates, vec!["https://x/1", "https://x/3"]);
}

#[tokio::test]
async fn sources_lists_contributors_in_provider_order() {
    let (a, _) = fake("a", Behavior::Found(meta("T")));
    let (b, _) = fake("b", Behavior::Nothing);
    let (c, _) = fake("c", Behavior::Found(meta("T"))); // adds nothing new
    let (d, _) = fake(
        "d",
        Behavior::Found(Metadata {
            genre: Some("Sci".into()),
            ..Default::default()
        }),
    );
    let m = svc(vec![a, b, c, d]).lookup(ISBN, false, 0).await.unwrap();
    assert_eq!(m.sources, vec!["a", "d"]);
}

#[tokio::test]
async fn failing_and_slow_providers_are_skipped() {
    let (a, _) = fake("a", Behavior::Fail);
    let (b, _) = fake("b", Behavior::Hang);
    let (c, _) = fake("c", Behavior::Found(meta("C")));
    let s = svc(vec![a, b, c]).with_timeout(Duration::from_millis(50));
    let m = s.lookup(ISBN, false, 0).await.unwrap();
    assert_eq!(m.title.as_deref(), Some("C"));
    assert_eq!(m.sources, vec!["c"]);
}

#[tokio::test]
async fn no_title_anywhere_is_none() {
    let (a, _) = fake(
        "a",
        Behavior::Found(Metadata {
            publisher: Some("P".into()),
            ..Default::default()
        }),
    );
    let (b, _) = fake("b", Behavior::Nothing);
    assert!(svc(vec![a, b]).lookup(ISBN, false, 0).await.is_none());
}

#[tokio::test]
async fn isbn_10_is_derived_for_978() {
    let (a, _) = fake("a", Behavior::Found(meta("T")));
    let s = svc(vec![a]);
    let m = s.lookup(ISBN, false, 0).await.unwrap();
    assert_eq!(m.isbn_13.as_deref(), Some(ISBN));
    assert_eq!(m.isbn_10.as_deref(), Some("0306406152"));
    let m = s.lookup("9791032305690", false, 0).await.unwrap();
    assert_eq!(m.isbn_13.as_deref(), Some("9791032305690"));
    assert_eq!(m.isbn_10, None);
}

#[tokio::test]
async fn positive_results_are_cached_for_thirty_days() {
    let (a, calls) = fake("a", Behavior::Found(meta("T")));
    let s = svc(vec![a]);
    assert!(s.lookup(ISBN, false, 1000).await.is_some());
    assert!(s.lookup(ISBN, false, 1000 + 30 * DAY - 1).await.is_some());
    assert_eq!(calls.load(Ordering::SeqCst), 1);
    assert!(s.lookup(ISBN, false, 1000 + 30 * DAY + 1).await.is_some());
    assert_eq!(calls.load(Ordering::SeqCst), 2);
}

#[tokio::test]
async fn negative_results_are_cached_for_a_day() {
    let (a, calls) = fake("a", Behavior::Nothing);
    let s = svc(vec![a]);
    assert!(s.lookup(ISBN, false, 1000).await.is_none());
    assert!(s.lookup(ISBN, false, 1000 + DAY - 1).await.is_none());
    assert_eq!(calls.load(Ordering::SeqCst), 1);
    assert!(s.lookup(ISBN, false, 1000 + DAY + 1).await.is_none());
    assert_eq!(calls.load(Ordering::SeqCst), 2);
}

#[tokio::test]
async fn fresh_bypasses_and_refreshes_the_cache() {
    let (a, calls) = fake("a", Behavior::Found(meta("T")));
    let s = svc(vec![a]);
    s.lookup(ISBN, false, 0).await;
    s.lookup(ISBN, true, 10).await;
    assert_eq!(calls.load(Ordering::SeqCst), 2);
    // Refreshed entry lives 30 days from the fresh call.
    s.lookup(ISBN, false, 10 + 30 * DAY - 1).await;
    assert_eq!(calls.load(Ordering::SeqCst), 2);
}

#[tokio::test]
async fn total_failure_is_not_cached() {
    let (a, ca) = fake("a", Behavior::Fail);
    let (b, cb) = fake("b", Behavior::Fail);
    let s = svc(vec![a, b]);
    assert!(s.lookup(ISBN, false, 0).await.is_none());
    assert!(s.lookup(ISBN, false, 1).await.is_none());
    assert_eq!(ca.load(Ordering::SeqCst), 2);
    assert_eq!(cb.load(Ordering::SeqCst), 2);
    assert_eq!(s.cache_len(), 0);
}

#[tokio::test]
async fn cache_is_bounded() {
    let (a, _) = fake("a", Behavior::Found(meta("T")));
    let s = svc(vec![a]);
    for i in 0..5001u32 {
        // Cache keys need not be valid ISBNs.
        s.lookup(&format!("978{i:010}"), false, i64::from(i)).await;
    }
    assert_eq!(s.cache_len(), 5000);
}

async fn route_state(ps: Vec<Arc<dyn Provider>>) -> Seeded {
    let mut s = seed(Role::Owner, None, None).await;
    s.state.lookup = Arc::new(LookupService::with_providers(ps));
    s
}

#[tokio::test]
async fn route_returns_metadata() {
    let (a, _) = fake("a", Behavior::Found(meta("Dune")));
    let s = route_state(vec![a]).await;
    let (st, _, body) = call(
        &s.state,
        "GET",
        &format!("/api/v1/lookup/isbn/{ISBN}"),
        Some(&s.session.access_token),
        None,
    )
    .await;
    assert_eq!(st, 200);
    assert_eq!(body["title"], "Dune");
    assert_eq!(body["isbn_13"], ISBN);
}

#[tokio::test]
async fn route_accepts_isbn_10_and_hyphens() {
    let (a, _) = fake("a", Behavior::Found(meta("Dune")));
    let s = route_state(vec![a]).await;
    for raw in ["0306406152", "0-306-40615-2", "978-0-306-40615-7"] {
        let (st, _, body) = call(
            &s.state,
            "GET",
            &format!("/api/v1/lookup/isbn/{raw}"),
            Some(&s.session.access_token),
            None,
        )
        .await;
        assert_eq!(st, 200, "{raw}");
        assert_eq!(body["isbn_13"], ISBN, "{raw}");
    }
}

#[tokio::test]
async fn route_rejects_bad_checksums() {
    let (a, calls) = fake("a", Behavior::Found(meta("Dune")));
    let s = route_state(vec![a]).await;
    for raw in ["9780306406158", "0306406153", "abc"] {
        let (st, _, body) = call(
            &s.state,
            "GET",
            &format!("/api/v1/lookup/isbn/{raw}"),
            Some(&s.session.access_token),
            None,
        )
        .await;
        assert_eq!(st, 422, "{raw}");
        assert_eq!(body["error_code"], "validation");
    }
    assert_eq!(calls.load(Ordering::SeqCst), 0);
}

#[tokio::test]
async fn route_unknown_isbn_is_isbn_not_found() {
    let (a, _) = fake("a", Behavior::Nothing);
    let s = route_state(vec![a]).await;
    let (st, _, body) = call(
        &s.state,
        "GET",
        &format!("/api/v1/lookup/isbn/{ISBN}"),
        Some(&s.session.access_token),
        None,
    )
    .await;
    assert_eq!(st, 404);
    assert_eq!(body["error_code"], "isbn_not_found");
}

#[tokio::test]
async fn route_needs_a_token() {
    let (a, _) = fake("a", Behavior::Found(meta("Dune")));
    let s = route_state(vec![a]).await;
    let (st, _, _) = call(
        &s.state,
        "GET",
        &format!("/api/v1/lookup/isbn/{ISBN}"),
        None,
        None,
    )
    .await;
    assert_eq!(st, 401);
}

#[tokio::test]
async fn guest_can_look_up() {
    let (a, _) = fake("a", Behavior::Found(meta("Dune")));
    let mut s = seed(Role::Guest, None, None).await;
    s.state.lookup = Arc::new(LookupService::with_providers(vec![a]));
    let (st, _, _) = call(
        &s.state,
        "GET",
        &format!("/api/v1/lookup/isbn/{ISBN}"),
        Some(&s.session.access_token),
        None,
    )
    .await;
    assert_eq!(st, 200);
}
