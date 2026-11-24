mod common;

use std::io::Read;
use std::path::PathBuf;

use bookeeper_core::auth::Role;
use bookeeper_core::backup::schedule::{run_once, BackupConfig};
use bookeeper_core::AppState;
use common::*;
use serde_json::json;

const DAY: i64 = 86_400;
const T0: i64 = 1_800_000_000;

fn dir_of(state: &AppState, lib: &str) -> PathBuf {
    state.files.backups_dir.join(lib)
}

fn autos(state: &AppState, lib: &str) -> Vec<String> {
    let mut v: Vec<String> = match std::fs::read_dir(dir_of(state, lib)) {
        Ok(rd) => rd
            .flatten()
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .filter(|n| n.starts_with("auto-") && n.ends_with(".zip"))
            .collect(),
        Err(_) => vec![],
    };
    v.sort();
    v
}

async fn set_config(state: &AppState, lib: &str, interval_days: u32, keep: u32) {
    let (lib, cfg) = (
        lib.to_string(),
        BackupConfig {
            interval_days,
            keep,
        },
    );
    state
        .db
        .run(move |c| bookeeper_core::backup::schedule::save_config(c, &lib, &cfg))
        .await
        .unwrap();
}

async fn add_library(state: &AppState, name: &str) -> String {
    let id = uuid::Uuid::now_v7().to_string();
    let (i, n) = (id.clone(), name.to_string());
    state
        .db
        .run(move |c| {
            c.execute(
                "INSERT INTO libraries (id, name, created_at) VALUES (?1, ?2, 1)",
                rusqlite::params![i, n],
            )
        })
        .await
        .unwrap();
    id
}

#[tokio::test]
async fn first_run_creates_a_backup_for_each_library() {
    let s = seed(Role::Owner, None, None).await;
    let other = add_library(&s.state, "Altra").await;
    assert_eq!(run_once(&s.state, T0).await, 2);
    assert_eq!(autos(&s.state, &s.library_id).len(), 1);
    assert_eq!(autos(&s.state, &other).len(), 1);
    assert!(!dir_of(&s.state, &s.library_id)
        .read_dir()
        .unwrap()
        .flatten()
        .any(|e| e.file_name().to_string_lossy().ends_with(".tmp")));
}

#[tokio::test]
async fn no_new_backup_before_the_interval() {
    let s = seed(Role::Owner, None, None).await;
    assert_eq!(run_once(&s.state, T0).await, 1);
    assert_eq!(run_once(&s.state, T0 + 3 * DAY - 60).await, 0);
    assert_eq!(autos(&s.state, &s.library_id).len(), 1);
}

#[tokio::test]
async fn new_backup_after_the_interval() {
    let s = seed(Role::Owner, None, None).await;
    assert_eq!(run_once(&s.state, T0).await, 1);
    assert_eq!(run_once(&s.state, T0 + 3 * DAY).await, 1);
    assert_eq!(autos(&s.state, &s.library_id).len(), 2);
}

#[tokio::test]
async fn interval_zero_disables() {
    let s = seed(Role::Owner, None, None).await;
    set_config(&s.state, &s.library_id, 0, 5).await;
    assert_eq!(run_once(&s.state, T0).await, 0);
    assert!(autos(&s.state, &s.library_id).is_empty());
}

#[tokio::test]
async fn rotation_keeps_only_the_newest() {
    let s = seed(Role::Owner, None, None).await;
    set_config(&s.state, &s.library_id, 1, 2).await;
    for i in 0..4 {
        assert_eq!(run_once(&s.state, T0 + i * DAY).await, 1);
    }
    let names = autos(&s.state, &s.library_id);
    assert_eq!(names.len(), 2);
    let stamp = |t: i64| {
        chrono::DateTime::from_timestamp(t, 0)
            .unwrap()
            .format("auto-%Y%m%d-%H%M%S.zip")
            .to_string()
    };
    assert_eq!(names, vec![stamp(T0 + 2 * DAY), stamp(T0 + 3 * DAY)]);
}

#[tokio::test]
async fn rotation_never_touches_other_files() {
    let s = seed(Role::Owner, None, None).await;
    set_config(&s.state, &s.library_id, 1, 1).await;
    let dir = dir_of(&s.state, &s.library_id);
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(dir.join("nota.txt"), "x").unwrap();
    std::fs::write(dir.join("manuale.zip"), "x").unwrap();
    for i in 0..3 {
        run_once(&s.state, T0 + i * DAY).await;
    }
    assert!(dir.join("nota.txt").exists());
    assert!(dir.join("manuale.zip").exists());
    assert_eq!(autos(&s.state, &s.library_id).len(), 1);
}

#[tokio::test]
async fn stale_tmp_files_are_removed_and_fresh_ones_kept() {
    let s = seed(Role::Owner, None, None).await;
    let dir = dir_of(&s.state, &s.library_id);
    std::fs::create_dir_all(&dir).unwrap();
    let stale = dir.join("auto-20200101-000000.zip.tmp");
    let fresh = dir.join("auto-20200102-000000.zip.tmp");
    std::fs::write(&stale, "x").unwrap();
    std::fs::write(&fresh, "x").unwrap();
    let now = chrono::Utc::now().timestamp();
    let old = std::time::SystemTime::now() - std::time::Duration::from_secs(2 * 3600);
    std::fs::File::options()
        .write(true)
        .open(&stale)
        .unwrap()
        .set_modified(old)
        .unwrap();
    run_once(&s.state, now).await;
    assert!(!stale.exists());
    assert!(fresh.exists());
}

#[tokio::test]
async fn a_failing_library_does_not_stop_the_others() {
    let s = seed(Role::Owner, None, None).await;
    let other = add_library(&s.state, "Altra").await;
    // The folder of one library is a plain file.
    std::fs::write(dir_of(&s.state, &s.library_id), "not a dir").unwrap();
    let created = run_once(&s.state, T0).await;
    assert_eq!(created, 1);
    assert_eq!(autos(&s.state, &other).len(), 1);
}

#[tokio::test]
async fn overlapping_runs_create_one_backup() {
    let s = seed(Role::Owner, None, None).await;
    let (a, b) = tokio::join!(run_once(&s.state, T0), run_once(&s.state, T0));
    assert_eq!(a + b, 1);
    assert_eq!(autos(&s.state, &s.library_id).len(), 1);
}

#[tokio::test]
async fn automatic_backups_are_audited() {
    let s = seed(Role::Owner, None, None).await;
    run_once(&s.state, T0).await;
    let lib = s.library_id.clone();
    let (n, detail): (i64, String) = s
        .state
        .db
        .run(move |c| {
            c.query_row(
                "SELECT COUNT(*), COALESCE(MAX(detail_json), '') FROM audit_log
                 WHERE library_id = ?1 AND action = 'library.backup'
                   AND user_id IS NULL AND device_id IS NULL AND entity_id = ?1",
                [lib],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
        })
        .await
        .unwrap();
    assert_eq!(n, 1);
    assert_eq!(
        serde_json::from_str::<serde_json::Value>(&detail).unwrap(),
        json!({ "automatic": true })
    );
}

#[tokio::test]
async fn created_archive_restores() {
    let s = seed(Role::Owner, None, None).await;
    run_once(&s.state, T0).await;
    let name = autos(&s.state, &s.library_id).remove(0);
    let file = std::fs::File::open(dir_of(&s.state, &s.library_id).join(name)).unwrap();
    let mut zip = zip::ZipArchive::new(file).unwrap();
    let mut manifest = String::new();
    zip.by_name("manifest.json")
        .unwrap()
        .read_to_string(&mut manifest)
        .unwrap();
    assert!(manifest.contains("bookeeper-backup"));
}

// ------------------------------------------------------------------ routes

#[tokio::test]
async fn config_defaults() {
    let s = seed(Role::Admin, None, None).await;
    let (st, _, b) = call(
        &s.state,
        "GET",
        "/api/v1/backups/config",
        Some(&s.session.access_token),
        None,
    )
    .await;
    assert_eq!(st, 200);
    assert_eq!(b, json!({ "interval_days": 3, "keep": 5 }));
}

#[tokio::test]
async fn config_round_trips() {
    let s = seed(Role::Admin, None, None).await;
    let t = Some(s.session.access_token.as_str());
    let body = json!({ "interval_days": 7, "keep": 10 });
    let (st, _, b) = call(
        &s.state,
        "PUT",
        "/api/v1/backups/config",
        t,
        Some(body.clone()),
    )
    .await;
    assert_eq!((st, &b), (200, &body));
    let (_, _, b) = call(&s.state, "GET", "/api/v1/backups/config", t, None).await;
    assert_eq!(b, body);
}

#[tokio::test]
async fn config_out_of_range_is_validation() {
    let s = seed(Role::Admin, None, None).await;
    let t = Some(s.session.access_token.as_str());
    for body in [
        json!({ "interval_days": 91, "keep": 5 }),
        json!({ "interval_days": 3, "keep": 0 }),
        json!({ "interval_days": 3, "keep": 51 }),
    ] {
        let (st, _, b) = call(&s.state, "PUT", "/api/v1/backups/config", t, Some(body)).await;
        assert_eq!(st, 422, "{b}");
        assert_eq!(b["error_code"], "validation");
    }
    let (_, _, b) = call(&s.state, "GET", "/api/v1/backups/config", t, None).await;
    assert_eq!(b, json!({ "interval_days": 3, "keep": 5 }));
}

#[tokio::test]
async fn list_shows_only_this_librarys_backups_newest_first() {
    let s = seed(Role::Admin, None, None).await;
    let other = add_library(&s.state, "Altra").await;
    set_config(&s.state, &s.library_id, 1, 5).await;
    run_once(&s.state, T0).await;
    run_once(&s.state, T0 + DAY).await;
    let (st, _, b) = call(
        &s.state,
        "GET",
        "/api/v1/backups",
        Some(&s.session.access_token),
        None,
    )
    .await;
    assert_eq!(st, 200);
    let items = b["items"].as_array().unwrap();
    assert_eq!(items.len(), 2);
    assert_eq!(items[0]["created_at"], T0 + DAY);
    assert_eq!(items[1]["created_at"], T0);
    assert!(items[0]["size_bytes"].as_u64().unwrap() > 0);
    assert!(items[0]["name"].as_str().unwrap().starts_with("auto-"));
    assert_eq!(autos(&s.state, &other).len(), 1);
}

#[tokio::test]
async fn routes_need_admin() {
    let s = seed(Role::Owner, None, None).await;
    let (_, member) = add_user(&s.state, &s.library_id, Role::Member, "Bea").await;
    let t = Some(member.access_token.as_str());
    for (m, p, body) in [
        ("GET", "/api/v1/backups", None),
        ("GET", "/api/v1/backups/config", None),
        (
            "PUT",
            "/api/v1/backups/config",
            Some(json!({"interval_days": 1, "keep": 1})),
        ),
    ] {
        let (st, _, _) = call(&s.state, m, p, t, body).await;
        assert_eq!(st, 403, "{m} {p}");
    }
}

#[tokio::test]
async fn routes_need_a_token() {
    let s = seed(Role::Owner, None, None).await;
    for (m, p) in [
        ("GET", "/api/v1/backups"),
        ("GET", "/api/v1/backups/config"),
        ("PUT", "/api/v1/backups/config"),
    ] {
        let (st, _, _) = call(&s.state, m, p, None, Some(json!({}))).await;
        assert_eq!(st, 401, "{m} {p}");
    }
}

fn auto_name(t: i64) -> String {
    chrono::DateTime::from_timestamp(t, 0)
        .unwrap()
        .format("auto-%Y%m%d-%H%M%S.zip")
        .to_string()
}

fn plant_future(state: &AppState, lib: &str, at: i64) -> String {
    let dir = dir_of(state, lib);
    std::fs::create_dir_all(&dir).unwrap();
    let name = auto_name(at);
    std::fs::write(dir.join(&name), b"future").unwrap();
    name
}

#[tokio::test]
async fn a_future_dated_backup_does_not_make_backups_due_forever() {
    let s = seed(Role::Owner, None, None).await;
    plant_future(&s.state, &s.library_id, T0 + 10 * DAY);
    assert_eq!(run_once(&s.state, T0).await, 1);
    assert_eq!(run_once(&s.state, T0 + 60).await, 0);
    assert_eq!(autos(&s.state, &s.library_id).len(), 2);
}

#[tokio::test]
async fn rotation_ignores_future_dated_backups() {
    let s = seed(Role::Owner, None, None).await;
    set_config(&s.state, &s.library_id, 1, 1).await;
    let future = plant_future(&s.state, &s.library_id, T0 + 10 * DAY);
    assert_eq!(run_once(&s.state, T0).await, 1);
    assert_eq!(run_once(&s.state, T0 + DAY).await, 1);
    let mut want = vec![future, auto_name(T0 + DAY)];
    want.sort();
    assert_eq!(autos(&s.state, &s.library_id), want);
}
