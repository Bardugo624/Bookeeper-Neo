use std::time::{Duration, Instant};

use bookeeper_core::{AppState, Db, DbError, SetupPolicy};

async fn count(db: &Db) -> Result<i64, DbError> {
    db.run(|c| c.query_row("SELECT COUNT(*) FROM t", [], |r| r.get(0)))
        .await
}

#[tokio::test]
async fn run_executes_on_the_shared_connection() {
    let db = Db::open_in_memory().unwrap();
    db.run(|c| c.execute_batch("CREATE TABLE t (x); INSERT INTO t VALUES (1);"))
        .await
        .unwrap();
    assert_eq!(count(&db).await.unwrap(), 1);
}

#[tokio::test]
async fn run_does_not_block_the_runtime() {
    let db = Db::open_in_memory().unwrap();
    let slow = async {
        db.run(|_| {
            std::thread::sleep(Duration::from_millis(200));
            Ok(())
        })
        .await
        .unwrap();
        Instant::now()
    };
    let fast = async {
        tokio::time::sleep(Duration::from_millis(10)).await;
        Instant::now()
    };
    let (slow_done, fast_done) = tokio::join!(slow, fast);
    assert!(fast_done < slow_done);
}

#[tokio::test]
async fn a_panic_inside_run_is_a_task_error() {
    let db = Db::open_in_memory().unwrap();
    let r: Result<(), DbError> = db.run(|_| panic!("boom")).await;
    assert!(matches!(r, Err(DbError::Task(_))));
    assert_eq!(
        db.run(|c| c.query_row("SELECT 7", [], |r| r.get::<_, i64>(0)))
            .await
            .unwrap(),
        7
    );
}

#[test]
fn jwt_secret_survives_reopening() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("t.sqlite");
    let a = AppState::open(Db::open(&path).unwrap(), SetupPolicy::Open).unwrap();
    let b = AppState::open(Db::open(&path).unwrap(), SetupPolicy::Open).unwrap();
    assert_eq!(a.jwt_secret.len(), 32);
    assert_eq!(a.jwt_secret, b.jwt_secret);
}

#[test]
fn jwt_secret_differs_between_databases() {
    let a = AppState::for_tests();
    let b = AppState::for_tests();
    assert_ne!(a.jwt_secret, b.jwt_secret);
}
