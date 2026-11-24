mod common;

use bookeeper_core::api::setup::new_setup_code;
use bookeeper_core::auth::limit::{RateLimiter, Rule, LOGIN};
use bookeeper_core::auth::Role;
use bookeeper_core::db::Db;
use bookeeper_core::state::SetupPolicy;
use bookeeper_core::AppState;
use common::{call, seed};
use serde_json::{json, Value};

const RULE: Rule = Rule {
    max_failures: 3,
    window_secs: 100,
};

// ---- unit ----

#[test]
fn allows_until_the_limit() {
    let l = RateLimiter::default();
    for i in 0..3 {
        assert!(l.check("k", RULE, 1000 + i).is_ok());
        l.record_failure("k", RULE, 1000 + i);
    }
    assert!(l.check("k", RULE, 1003).is_err());
}

#[test]
fn blocks_at_the_limit_with_retry_after() {
    let l = RateLimiter::default();
    for t in [1000, 1010, 1020] {
        l.record_failure("k", RULE, t);
    }
    assert_eq!(l.check("k", RULE, 1030), Err(70));
    assert_eq!(l.check("k", RULE, 1099), Err(1));
}

#[test]
fn window_slides() {
    let l = RateLimiter::default();
    for t in [1000, 1010, 1020] {
        l.record_failure("k", RULE, t);
    }
    assert!(l.check("k", RULE, 1099).is_err());
    // The oldest failure leaves the window; the other two remain.
    assert!(l.check("k", RULE, 1100).is_ok());
    l.record_failure("k", RULE, 1100);
    assert!(l.check("k", RULE, 1101).is_err());
}

#[test]
fn reset_clears_the_key() {
    let l = RateLimiter::default();
    for t in [1000, 1001, 1002] {
        l.record_failure("k", RULE, t);
    }
    l.reset("k");
    assert!(l.check("k", RULE, 1003).is_ok());
    assert!(l.is_empty());
}

#[test]
fn keys_are_independent() {
    let l = RateLimiter::default();
    for t in [1000, 1001, 1002] {
        l.record_failure("a", RULE, t);
    }
    assert!(l.check("a", RULE, 1003).is_err());
    assert!(l.check("b", RULE, 1003).is_ok());
}

#[test]
fn expired_entries_are_dropped() {
    let l = RateLimiter::default();
    l.record_failure("a", RULE, 1000);
    assert_eq!(l.len(), 1);
    assert!(l.check("a", RULE, 1100).is_ok());
    assert_eq!(l.len(), 0);

    // A sweep removes expired keys once the map is large.
    for i in 0..10_000 {
        l.record_failure(&format!("k{i}"), RULE, 1000);
    }
    l.record_failure("fresh", RULE, 2000);
    assert_eq!(l.len(), 1);
}

#[test]
fn begin_counts_in_flight_attempts() {
    let l = RateLimiter::default();
    let held: Vec<_> = (0..3)
        .map(|_| l.begin("k", RULE, 1000).expect("slot"))
        .collect();
    assert!(l.begin("k", RULE, 1000).is_err());
    drop(held);
}

const RULE5: Rule = Rule {
    max_failures: 5,
    window_secs: 900,
};

#[test]
fn retry_after_is_short_when_only_in_flight_attempts_block() {
    let l = RateLimiter::default();
    for _ in 0..4 {
        l.record_failure("k", RULE5, 1000);
    }
    let _open = l.begin("k", RULE5, 1000).expect("fifth slot");
    assert_eq!(l.begin("k", RULE5, 1000).err(), Some(1));
}

#[test]
fn retry_after_follows_the_oldest_failure_when_failures_alone_block() {
    let l = RateLimiter::default();
    for _ in 0..5 {
        l.record_failure("k", RULE5, 1000);
    }
    assert_eq!(
        l.begin("k", RULE5, 1100).err(),
        Some((RULE5.window_secs - 100) as u64)
    );
}

#[test]
fn neutral_and_drop_release_the_reservation() {
    let l = RateLimiter::default();
    let a = l.begin("k", RULE, 1000).unwrap();
    let b = l.begin("k", RULE, 1000).unwrap();
    let c = l.begin("k", RULE, 1000).unwrap();
    assert!(l.begin("k", RULE, 1000).is_err());
    a.neutral();
    let d = l.begin("k", RULE, 1000).expect("neutral freed a slot");
    assert!(l.begin("k", RULE, 1000).is_err());
    drop(b);
    assert!(l.begin("k", RULE, 1000).is_ok());
    drop((c, d));
    assert!(l.is_empty());
}

#[test]
fn failed_keeps_the_slot_and_succeeded_clears_the_key() {
    let l = RateLimiter::default();
    for _ in 0..3 {
        l.begin("k", RULE, 1000).unwrap().failed();
    }
    assert!(l.begin("k", RULE, 1001).is_err());
    l.reset("k");
    for _ in 0..2 {
        l.begin("k", RULE, 1000).unwrap().failed();
    }
    l.begin("k", RULE, 1000).unwrap().succeeded();
    assert!(l.is_empty());
    for _ in 0..3 {
        assert!(l.begin("k", RULE, 1002).is_ok());
    }
}

// ---- through the router ----

const PW: &str = "correct horse";

async fn login(state: &AppState, email: &str, pw: &str) -> (u16, axum::http::HeaderMap, Value) {
    call(
        state,
        "POST",
        "/api/v1/auth/login",
        None,
        Some(json!({"email": email, "password": pw, "device_name": "Laptop", "device_kind": "desktop"})),
    )
    .await
}

async fn libraries(state: &AppState, email: &str, pw: &str) -> u16 {
    call(
        state,
        "POST",
        "/api/v1/auth/libraries",
        None,
        Some(json!({"email": email, "password": pw})),
    )
    .await
    .0
}

#[tokio::test]
async fn sixth_wrong_password_is_rate_limited() {
    let s = seed(Role::Owner, Some("ada@example.com"), Some(PW)).await;
    for _ in 0..5 {
        assert_eq!(login(&s.state, "ada@example.com", "nope nope").await.0, 401);
    }
    let (status, headers, body) = login(&s.state, "ada@example.com", "nope nope").await;
    assert_eq!(status, 429);
    assert_eq!(body["error_code"], "rate_limited");
    let retry: u64 = headers["retry-after"].to_str().unwrap().parse().unwrap();
    assert!((1..=900).contains(&retry));
}

#[tokio::test]
async fn blocked_email_is_blocked_even_with_the_right_password() {
    let s = seed(Role::Owner, Some("ada@example.com"), Some(PW)).await;
    for _ in 0..5 {
        login(&s.state, "ada@example.com", "nope nope").await;
    }
    assert_eq!(login(&s.state, "ada@example.com", PW).await.0, 429);
    // Case and spacing normalise to the same key.
    assert_eq!(login(&s.state, " ADA@example.com ", PW).await.0, 429);
}

#[tokio::test]
async fn another_email_is_not_affected() {
    let s = seed(Role::Owner, Some("ada@example.com"), Some(PW)).await;
    for _ in 0..5 {
        login(&s.state, "ada@example.com", "nope nope").await;
    }
    assert_eq!(login(&s.state, "ada@example.com", "xxxxxxxx").await.0, 429);
    assert_eq!(
        login(&s.state, "other@example.com", "xxxxxxxx").await.0,
        401
    );
    // Unknown emails get the same 429 shape as existing ones.
    for _ in 0..5 {
        login(&s.state, "ghost@example.com", "xxxxxxxx").await;
    }
    let (status, _, body) = login(&s.state, "ghost@example.com", "xxxxxxxx").await;
    assert_eq!(status, 429);
    assert_eq!(body["error_code"], "rate_limited");
}

#[tokio::test]
async fn successful_login_resets_the_counter() {
    let s = seed(Role::Owner, Some("ada@example.com"), Some(PW)).await;
    for _ in 0..4 {
        assert_eq!(
            login(&s.state, "ada@example.com", "bad bad bad").await.0,
            401
        );
    }
    assert_eq!(login(&s.state, "ada@example.com", PW).await.0, 200);
    for _ in 0..4 {
        assert_eq!(
            login(&s.state, "ada@example.com", "bad bad bad").await.0,
            401
        );
    }
}

#[tokio::test]
async fn libraries_and_login_share_the_counter() {
    let s = seed(Role::Owner, Some("ada@example.com"), Some(PW)).await;
    for _ in 0..3 {
        assert_eq!(
            libraries(&s.state, "ada@example.com", "bad bad bad").await,
            401
        );
    }
    for _ in 0..2 {
        assert_eq!(
            login(&s.state, "ada@example.com", "bad bad bad").await.0,
            401
        );
    }
    assert_eq!(libraries(&s.state, "ada@example.com", PW).await, 429);
    assert_eq!(login(&s.state, "ada@example.com", PW).await.0, 429);
}

#[tokio::test]
async fn redeem_is_limited_globally() {
    let s = seed(Role::Owner, Some("ada@example.com"), Some(PW)).await;
    let (st, _, created) = call(
        &s.state,
        "POST",
        "/api/v1/pairing/codes",
        Some(&s.session.access_token),
        None,
    )
    .await;
    assert_eq!(st, 201);
    let good = created["code"].as_str().unwrap().to_string();
    let redeem = |code: String| {
        let state = s.state.clone();
        async move {
            call(
                &state,
                "POST",
                "/api/v1/pairing/redeem",
                None,
                Some(json!({"code": code, "device_name": "Phone", "device_kind": "mobile"})),
            )
            .await
        }
    };
    for i in 0..10 {
        let (st, _, b) = redeem(format!("WRONG-{i}")).await;
        assert_eq!(st, 401);
        assert_eq!(b["error_code"], "pairing_code_invalid");
    }
    let (st, headers, b) = redeem(good).await;
    assert_eq!(st, 429);
    assert_eq!(b["error_code"], "rate_limited");
    let retry: u64 = headers["retry-after"].to_str().unwrap().parse().unwrap();
    assert!((1..=600).contains(&retry));
}

fn server_state() -> AppState {
    AppState::open(Db::open_in_memory().expect("db"), SetupPolicy::CodeRequired).expect("state")
}

fn setup_body(code: &str) -> Value {
    json!({
        "library_name": "Casa", "display_name": "Ada", "device_name": "Laptop",
        "device_kind": "desktop", "email": "ada@example.com", "password": PW,
        "setup_code": code,
    })
}

#[tokio::test]
async fn setup_code_guessing_is_limited() {
    let state = server_state();
    let real = state.db.run(new_setup_code).await.expect("code");
    for i in 0..5 {
        let (st, _, b) = call(
            &state,
            "POST",
            "/api/v1/setup",
            None,
            Some(setup_body(&format!("BAD-{i}"))),
        )
        .await;
        assert_eq!(st, 403);
        assert_eq!(b["error_code"], "setup_code_invalid");
    }
    let (st, headers, b) = call(
        &state,
        "POST",
        "/api/v1/setup",
        None,
        Some(setup_body(&real)),
    )
    .await;
    assert_eq!(st, 429);
    assert_eq!(b["error_code"], "rate_limited");
    assert!(headers.contains_key("retry-after"));
}

#[tokio::test]
async fn open_setup_is_not_limited() {
    let s = seed(Role::Owner, None, None).await; // Open policy, setup already done
    let body = json!({"library_name": "Casa", "display_name": "Ada", "device_name": "L", "device_kind": "desktop"});
    for _ in 0..8 {
        let (st, _, b) = call(&s.state, "POST", "/api/v1/setup", None, Some(body.clone())).await;
        assert_eq!(st, 409);
        assert_eq!(b["error_code"], "setup_closed");
    }
}

#[tokio::test]
async fn validation_errors_do_not_count() {
    let s = seed(Role::Owner, Some("ada@example.com"), Some(PW)).await;
    for _ in 0..8 {
        let (st, _, _) = login(&s.state, "not-an-email", "xxxxxxxx").await;
        assert_eq!(st, 422);
        let (st, _, _) = call(
            &s.state,
            "POST",
            "/api/v1/auth/login",
            None,
            Some(json!({"email": "ada@example.com", "password": "xxxxxxxx", "device_name": "  ", "device_kind": "desktop"})),
        )
        .await;
        assert_eq!(st, 422);
    }
    assert_eq!(login(&s.state, "ada@example.com", PW).await.0, 200);
    let _ = LOGIN;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn burst_of_wrong_logins_is_capped() {
    let s = seed(Role::Owner, Some("ada@example.com"), Some(PW)).await;
    let mut set = tokio::task::JoinSet::new();
    for _ in 0..30 {
        let state = s.state.clone();
        set.spawn(async move { login(&state, "ada@example.com", "nope nope").await.0 });
    }
    let (mut unauthorized, mut limited) = (0, 0);
    while let Some(st) = set.join_next().await {
        match st.unwrap() {
            401 => unauthorized += 1,
            429 => limited += 1,
            other => panic!("unexpected status {other}"),
        }
    }
    assert!(unauthorized <= 5, "{unauthorized} wrong logins got through");
    assert_eq!(unauthorized + limited, 30);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn burst_of_wrong_redeems_is_capped() {
    let s = seed(Role::Owner, Some("ada@example.com"), Some(PW)).await;
    let mut set = tokio::task::JoinSet::new();
    for i in 0..30 {
        let state = s.state.clone();
        set.spawn(async move {
            call(
                &state,
                "POST",
                "/api/v1/pairing/redeem",
                None,
                Some(json!({"code": format!("WRONG-{i}"), "device_name": "Phone", "device_kind": "mobile"})),
            )
            .await
            .0
        });
    }
    let (mut unauthorized, mut limited) = (0, 0);
    while let Some(st) = set.join_next().await {
        match st.unwrap() {
            401 => unauthorized += 1,
            429 => limited += 1,
            other => panic!("unexpected status {other}"),
        }
    }
    assert!(
        unauthorized <= 10,
        "{unauthorized} wrong redeems got through"
    );
    assert_eq!(unauthorized + limited, 30);
}
