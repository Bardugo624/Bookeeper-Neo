//! Registry: installed state, open at login, WebView2 and key deletion. Everything under
//! `HKCU` goes through `prefix` (empty for the real keys).

use std::io;
use std::path::{Component, Path, PathBuf, Prefix};

use winreg::enums::*;
use winreg::{RegKey, RegValue};

use crate::sys::InstallState;

pub const UNINSTALL_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Uninstall\Bookeeper";
pub const INSTALL_KEY: &str = r"Software\bookeeper\Bookeeper";
pub const RUN_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
pub const APPROVED_KEY: &str =
    r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run";
pub const RUN_VALUE: &str = "Bookeeper";

const WEBVIEW2_CLIENT: &str = "{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}";

fn join(prefix: &str, key: &str) -> String {
    let key = key.trim_matches('\\');
    if prefix.is_empty() {
        key.to_string()
    } else {
        format!("{prefix}\\{key}")
    }
}

fn hkcu() -> RegKey {
    RegKey::predef(HKEY_CURRENT_USER)
}

fn not_found_as<T>(r: io::Result<T>) -> io::Result<Option<T>> {
    match r {
        Ok(v) => Ok(Some(v)),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e),
    }
}

/// An absolute path on a local drive letter (not UNC, not a mapped network drive).
fn is_local_absolute(p: &Path) -> bool {
    let mut it = p.components();
    let disk = matches!(
        it.next(),
        Some(Component::Prefix(pre)) if matches!(pre.kind(), Prefix::Disk(_) | Prefix::VerbatimDisk(_))
    );
    disk && matches!(it.next(), Some(Component::RootDir)) && !super::disk::is_network_path(p)
}

pub fn install_state(prefix: &str) -> io::Result<Option<InstallState>> {
    let root = hkcu();
    let own = not_found_as(root.open_subkey(join(prefix, INSTALL_KEY)))?;
    let uninstall = not_found_as(root.open_subkey(join(prefix, UNINSTALL_KEY)))?;

    let mut dir: Option<String> = None;
    if let Some(k) = &own {
        dir = not_found_as(k.get_value::<String, _>(""))?;
    }
    if dir.as_deref().is_none_or(|d| d.trim().is_empty()) {
        dir = match &uninstall {
            Some(k) => not_found_as(k.get_value::<String, _>("InstallLocation"))?,
            None => None,
        };
    }
    let Some(dir) = dir else { return Ok(None) };
    let dir = dir.trim().trim_matches('"').trim();
    if dir.is_empty() {
        return Ok(None);
    }
    let dir = PathBuf::from(dir);
    if !is_local_absolute(&dir) {
        return Ok(None);
    }
    let version = match &uninstall {
        Some(k) => not_found_as(k.get_value::<String, _>("DisplayVersion"))?.unwrap_or_default(),
        None => String::new(),
    };
    Ok(Some(InstallState { dir, version }))
}

pub fn has_webview2() -> bool {
    let probe = |hive: RegKey, path: &str| -> bool {
        let Ok(key) = hive.open_subkey_with_flags(path, KEY_READ) else { return false };
        match key.get_value::<String, _>("pv") {
            Ok(v) => {
                let v = v.trim();
                !v.is_empty() && v != "0.0.0.0"
            }
            Err(_) => false,
        }
    };
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    probe(
        hklm,
        &format!(r"SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{WEBVIEW2_CLIENT}"),
    ) || probe(hkcu(), &format!(r"SOFTWARE\Microsoft\EdgeUpdate\Clients\{WEBVIEW2_CLIENT}"))
}

pub fn autostart_enable(prefix: &str, exe: &Path) -> io::Result<()> {
    let root = hkcu();
    let (run, _) = root.create_subkey(join(prefix, RUN_KEY))?;
    run.set_value(RUN_VALUE, &format!("\"{}\" --autostart", exe.display()))?;
    let (approved, _) = root.create_subkey(join(prefix, APPROVED_KEY))?;
    let mut bytes = vec![0u8; 12];
    bytes[0] = 0x02;
    approved.set_raw_value(
        RUN_VALUE,
        &RegValue { bytes: std::borrow::Cow::Owned(bytes), vtype: REG_BINARY },
    )
}

pub fn autostart_disable(prefix: &str) -> io::Result<()> {
    let root = hkcu();
    for key in [RUN_KEY, APPROVED_KEY] {
        if let Some(k) =
            not_found_as(root.open_subkey_with_flags(join(prefix, key), KEY_SET_VALUE))?
        {
            not_found_as(k.delete_value(RUN_VALUE))?;
        }
    }
    Ok(())
}

pub fn autostart_is_enabled(prefix: &str) -> io::Result<bool> {
    let root = hkcu();
    let Some(run) = not_found_as(root.open_subkey(join(prefix, RUN_KEY)))? else {
        return Ok(false);
    };
    if not_found_as(run.get_raw_value(RUN_VALUE))?.is_none() {
        return Ok(false);
    }
    let approved = not_found_as(root.open_subkey(join(prefix, APPROVED_KEY)))?;
    let flag = match approved {
        Some(k) => not_found_as(k.get_raw_value(RUN_VALUE))?,
        None => None,
    };
    Ok(match flag.and_then(|v| v.bytes.first().copied()) {
        Some(first) => first % 2 == 0,
        None => true,
    })
}

pub fn delete_tree(prefix: &str, key: &str) -> io::Result<()> {
    if key.trim_matches('\\').is_empty() {
        return Err(io::Error::new(io::ErrorKind::InvalidInput, "empty registry key"));
    }
    not_found_as(hkcu().delete_subkey_all(join(prefix, key))).map(|_| ())
}

pub fn delete_key_if_empty(prefix: &str, key: &str) -> io::Result<()> {
    if key.trim_matches('\\').is_empty() {
        return Err(io::Error::new(io::ErrorKind::InvalidInput, "empty registry key"));
    }
    let path = join(prefix, key);
    let root = hkcu();
    let Some(k) = not_found_as(root.open_subkey(&path))? else { return Ok(()) };
    let info = k.query_info()?;
    drop(k);
    if info.sub_keys == 0 && info.values == 0 {
        not_found_as(root.delete_subkey(&path))?;
    }
    Ok(())
}
