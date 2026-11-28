//! Open at login: the `Run` value plus the Task Manager's `StartupApproved` flag.
//! Shared by the Setup and the desktop app. Off Windows everything is `Unsupported`.

use std::io;
use std::path::Path;

/// Writes `Run\Bookeeper` = `"<exe>" --autostart` and marks it enabled in `StartupApproved`.
pub fn enable(exe: &Path) -> io::Result<()> {
    #[cfg(windows)]
    {
        crate::sys::windows::registry::autostart_enable("", exe)
    }
    #[cfg(not(windows))]
    {
        let _ = exe;
        Err(io::Error::from(io::ErrorKind::Unsupported))
    }
}

/// Removes both values; missing ones are fine.
pub fn disable() -> io::Result<()> {
    #[cfg(windows)]
    {
        crate::sys::windows::registry::autostart_disable("")
    }
    #[cfg(not(windows))]
    {
        Err(io::Error::from(io::ErrorKind::Unsupported))
    }
}

/// True when `Run\Bookeeper` exists and the Task Manager has not switched it off.
pub fn is_enabled() -> io::Result<bool> {
    #[cfg(windows)]
    {
        crate::sys::windows::registry::autostart_is_enabled("")
    }
    #[cfg(not(windows))]
    {
        Err(io::Error::from(io::ErrorKind::Unsupported))
    }
}

#[cfg(all(test, not(windows)))]
mod tests {
    use super::*;

    #[test]
    fn unsupported_off_windows() {
        assert_eq!(
            enable(Path::new("x")).unwrap_err().kind(),
            io::ErrorKind::Unsupported
        );
        assert_eq!(disable().unwrap_err().kind(), io::ErrorKind::Unsupported);
        assert_eq!(is_enabled().unwrap_err().kind(), io::ErrorKind::Unsupported);
    }
}
