use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use bookeeper_core::Db;

#[test]
fn server_binary_writes_an_automatic_backup() {
    let tmp = tempfile::tempdir().unwrap();
    let id = uuid_like();
    {
        let db = Db::open(&tmp.path().join("bookeeper.sqlite")).unwrap();
        let lib = id.clone();
        db.with(move |c| {
            c.execute(
                "INSERT INTO libraries (id, name, created_at) VALUES (?1, 'Casa', 1)",
                [lib],
            )
        })
        .unwrap();
    }
    let mut child = Command::new(env!("CARGO_BIN_EXE_bookeeper-server"))
        .args(["--port", "0", "--bind", "127.0.0.1", "--data-dir"])
        .arg(tmp.path())
        .stdout(Stdio::null())
        .spawn()
        .unwrap();
    let dir = tmp.path().join("backups").join(&id);
    let deadline = Instant::now() + Duration::from_secs(20);
    let mut found = false;
    while Instant::now() < deadline && !found {
        found = std::fs::read_dir(&dir)
            .map(|rd| {
                rd.flatten().any(|e| {
                    let n = e.file_name().to_string_lossy().into_owned();
                    n.starts_with("auto-") && n.ends_with(".zip")
                })
            })
            .unwrap_or(false);
        std::thread::sleep(Duration::from_millis(100));
    }
    let _ = child.kill();
    let _ = child.wait();
    assert!(found, "no auto-*.zip appeared under {}", dir.display());
}

fn uuid_like() -> String {
    let n = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    format!("lib-{n:x}")
}
