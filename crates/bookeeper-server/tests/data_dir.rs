use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};

use bookeeper_server::{build, Config};

#[test]
fn server_binary_keeps_files_in_its_data_dir() {
    let tmp = tempfile::tempdir().unwrap();
    let mut child = Command::new(env!("CARGO_BIN_EXE_bookeeper-server"))
        .args(["--port", "0", "--bind", "127.0.0.1", "--data-dir"])
        .arg(tmp.path())
        .stdout(Stdio::piped())
        .spawn()
        .unwrap();
    let reader = BufReader::new(child.stdout.take().unwrap());
    let listening = reader
        .lines()
        .map_while(Result::ok)
        .any(|l| l.contains("in ascolto su"));
    let covers = tmp.path().join("covers").is_dir();
    let backups = tmp.path().join("backups").is_dir();
    let _ = child.kill();
    let _ = child.wait();
    assert!(listening, "server never reported it was listening");
    assert!(covers, "covers/ missing from the data dir");
    assert!(backups, "backups/ missing from the data dir");
}

#[test]
fn library_build_keeps_files_in_its_data_dir() {
    let tmp = tempfile::tempdir().unwrap();
    let cfg = {
        let mut c = Config::for_data_dir(tmp.path());
        c.bind = "127.0.0.1".parse().unwrap();
        c.port = Some(0);
        c
    };
    let _router = build(&cfg).unwrap();
    assert!(tmp.path().join("covers").is_dir());
    assert!(tmp.path().join("backups").is_dir());
}
