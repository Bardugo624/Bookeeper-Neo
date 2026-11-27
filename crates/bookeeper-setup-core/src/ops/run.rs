//! Helpers shared by install and uninstall: progress reporting, the polled
//! process run, the private temp folder and hashing.

use crate::progress::{ProgressModel, Signal, Snapshot};
use crate::sys::{RunOutcome, System};
use sha2::{Digest, Sha256};
use std::ffi::OsString;
use std::io::{self, Read};
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::time::{Duration, Instant};

pub const POLL: Duration = Duration::from_millis(100);
pub const NSIS_TIMEOUT: Duration = Duration::from_secs(10 * 60);

/// Feeds signals to the model and hands every snapshot to the caller.
pub struct Reporter<'a> {
    model: ProgressModel,
    report: &'a mut dyn FnMut(Snapshot),
    last: Instant,
}

impl<'a> Reporter<'a> {
    pub fn new(model: ProgressModel, report: &'a mut dyn FnMut(Snapshot)) -> Self {
        Self { model, report, last: Instant::now() }
    }

    pub fn signal(&mut self, s: Signal) -> Snapshot {
        let snap = self.model.observe(Instant::now(), s);
        (self.report)(snap);
        self.last = Instant::now();
        snap
    }

    /// A tick, but only when one is due: long synchronous work calls this often.
    pub fn tick_if_due(&mut self) {
        if self.last.elapsed() >= POLL {
            self.signal(Signal::Tick);
        }
    }

    /// Sends `Finished` and keeps ticking until the model says the bar is done.
    pub fn finish(&mut self) {
        let mut snap = self.signal(Signal::Finished);
        let give_up = Instant::now() + Duration::from_secs(120);
        while !snap.done && Instant::now() < give_up {
            std::thread::sleep(POLL);
            snap = self.signal(Signal::Tick);
        }
    }
}

/// Runs a program on a helper thread and calls `poll` every 100 ms until it ends.
pub fn run_polled(
    sys: &dyn System,
    program: &Path,
    raw_args: &str,
    env: &[(OsString, OsString)],
    mut poll: impl FnMut(),
) -> io::Result<RunOutcome> {
    std::thread::scope(|s| {
        let (tx, rx) = mpsc::channel();
        s.spawn(move || {
            let _ = tx.send(sys.run_and_wait(program, raw_args, env, NSIS_TIMEOUT));
        });
        loop {
            match rx.recv_timeout(POLL) {
                Ok(result) => return result,
                Err(mpsc::RecvTimeoutError::Timeout) => poll(),
                Err(mpsc::RecvTimeoutError::Disconnected) => {
                    return Err(io::Error::other("the process runner stopped unexpectedly"))
                }
            }
        }
    })
}

/// A new folder with a random name, created exclusively (it must not exist yet).
pub fn create_private_dir(parent: &Path) -> io::Result<PathBuf> {
    use std::hash::{BuildHasher, Hasher};
    for attempt in 0..32u32 {
        let mut h = std::collections::hash_map::RandomState::new().build_hasher();
        h.write_u32(std::process::id());
        h.write_u32(attempt);
        if let Ok(d) = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH) {
            h.write_u128(d.as_nanos());
        }
        let dir = parent.join(format!("Bookeeper-Setup-{:016x}", h.finish()));
        match std::fs::create_dir(&dir) {
            Ok(()) => return Ok(dir),
            Err(e) if e.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(e),
        }
    }
    Err(io::Error::new(io::ErrorKind::AlreadyExists, "no free temp folder name"))
}

/// Removes a folder tree, retrying briefly: a process that just exited may still hold files.
pub fn remove_tree(dir: &Path) -> io::Result<()> {
    let mut last = Ok(());
    for _ in 0..10 {
        match std::fs::remove_dir_all(dir) {
            Ok(()) => return Ok(()),
            Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(()),
            Err(e) => last = Err(e),
        }
        std::thread::sleep(Duration::from_millis(200));
    }
    last
}

/// Hex SHA-256 of everything `r` yields; `each` runs after every chunk.
pub fn sha256_hex(r: &mut impl Read, mut each: impl FnMut()) -> io::Result<String> {
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 256 * 1024];
    loop {
        let n = r.read(&mut buf)?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
        each();
    }
    Ok(hasher.finalize().iter().map(|b| format!("{b:02x}")).collect())
}

/// Size of the largest `ns*.tmp` file directly inside `dir` (NSIS's unpack file).
pub fn largest_nsis_tmp(dir: &Path) -> Option<u64> {
    std::fs::read_dir(dir)
        .ok()?
        .flatten()
        .filter(|e| {
            let n = e.file_name().to_string_lossy().to_ascii_lowercase();
            n.starts_with("ns") && n.ends_with(".tmp")
        })
        .filter_map(|e| e.metadata().ok().filter(|m| m.is_file()).map(|m| m.len()))
        .max()
}

/// Case- and separator-insensitive comparison of two folder or file paths.
pub fn same_path(a: &Path, b: &Path) -> bool {
    let norm = |p: &Path| p.to_string_lossy().replace('/', "\\").trim_end_matches('\\').to_lowercase();
    norm(a) == norm(b)
}
