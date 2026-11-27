//! Launching the NSIS installer with verbatim arguments.

use std::ffi::OsString;
use std::io;
use std::os::windows::process::CommandExt;
use std::path::Path;
use std::process::Command;
use std::time::{Duration, Instant};

use crate::sys::RunOutcome;

pub fn run_and_wait(
    program: &Path,
    raw_args: &str,
    env: &[(OsString, OsString)],
    timeout: Duration,
) -> io::Result<RunOutcome> {
    let mut cmd = Command::new(program);
    // Never `arg`: NSIS parses `/D=` itself and a quoted folder would break it.
    cmd.raw_arg(raw_args);
    for (k, v) in env {
        cmd.env(k, v);
    }
    let mut child = cmd.spawn()?;
    let start = Instant::now();
    loop {
        if let Some(status) = child.try_wait()? {
            return Ok(RunOutcome::Exited(status.code().unwrap_or(-1)));
        }
        if start.elapsed() >= timeout {
            let _ = child.kill();
            let _ = child.wait();
            return Ok(RunOutcome::TimedOut);
        }
        std::thread::sleep(Duration::from_millis(50));
    }
}
