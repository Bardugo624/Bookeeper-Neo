//! Reading the target of a `.lnk`.

use std::io;
use std::path::{Path, PathBuf};

use windows::core::{Interface, PCWSTR};
use windows::Win32::Storage::FileSystem::WIN32_FIND_DATAW;
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoUninitialize, IPersistFile, CLSCTX_INPROC_SERVER,
    COINIT_APARTMENTTHREADED, STGM_READ,
};
use windows::Win32::UI::Shell::{IShellLinkW, ShellLink};

use super::wide;

fn other<E: std::fmt::Display>(e: E) -> io::Error {
    io::Error::other(e.to_string())
}

/// `Ok(None)` when the file does not exist or has no target. COM runs on its own thread so
/// the caller's apartment is untouched.
pub fn shortcut_target(lnk: &Path) -> io::Result<Option<PathBuf>> {
    if !lnk.exists() {
        return Ok(None);
    }
    let lnk = lnk.to_path_buf();
    std::thread::spawn(move || read(&lnk)).join().map_err(|_| other("shortcut thread panicked"))?
}

fn read(lnk: &Path) -> io::Result<Option<PathBuf>> {
    // SAFETY: COM is initialised on this thread and released after every interface is dropped.
    unsafe {
        let init = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let result = (|| -> io::Result<Option<PathBuf>> {
            let link: IShellLinkW =
                CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER).map_err(other)?;
            let file: IPersistFile = link.cast().map_err(other)?;
            let path = wide::to_wide(lnk.as_os_str());
            file.Load(PCWSTR(path.as_ptr()), STGM_READ).map_err(other)?;
            let mut buf = [0u16; 1024];
            let mut data = WIN32_FIND_DATAW::default();
            link.GetPath(&mut buf, &mut data, 0).map_err(other)?;
            let target = wide::path_from_buf(&buf);
            Ok(if target.as_os_str().is_empty() { None } else { Some(target) })
        })();
        if init.is_ok() {
            CoUninitialize();
        }
        result
    }
}
