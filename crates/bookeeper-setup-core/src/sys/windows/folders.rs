//! Known folders and the temp directory.

use std::path::PathBuf;
use std::ptr::null_mut;

use windows_sys::core::GUID;
use windows_sys::Win32::Storage::FileSystem::GetTempPathW;
use windows_sys::Win32::System::Com::CoTaskMemFree;
use windows_sys::Win32::System::LibraryLoader::{GetModuleHandleW, GetProcAddress};
use windows_sys::Win32::UI::Shell::{
    FOLDERID_Desktop, FOLDERID_LocalAppData, FOLDERID_Programs, FOLDERID_RoamingAppData,
    SHGetKnownFolderPath,
};

use super::wide;

fn known_folder(id: &GUID) -> Option<PathBuf> {
    let mut out: *mut u16 = null_mut();
    // SAFETY: `out` receives a CoTaskMem string that we free below.
    let hr = unsafe { SHGetKnownFolderPath(id, 0, null_mut(), &mut out) };
    if hr < 0 || out.is_null() {
        if !out.is_null() {
            unsafe { CoTaskMemFree(out as *const _) };
        }
        return None;
    }
    let path = PathBuf::from(unsafe { wide::from_ptr(out) });
    unsafe { CoTaskMemFree(out as *const _) };
    Some(path)
}

fn env_or_empty(name: &str) -> PathBuf {
    std::env::var_os(name)
        .map(PathBuf::from)
        .unwrap_or_default()
}

pub fn app_data() -> PathBuf {
    known_folder(&FOLDERID_RoamingAppData).unwrap_or_else(|| env_or_empty("APPDATA"))
}

pub fn local_app_data() -> PathBuf {
    known_folder(&FOLDERID_LocalAppData).unwrap_or_else(|| env_or_empty("LOCALAPPDATA"))
}

pub fn desktop_dir() -> PathBuf {
    known_folder(&FOLDERID_Desktop).unwrap_or_else(|| env_or_empty("USERPROFILE").join("Desktop"))
}

pub fn programs_dir() -> PathBuf {
    known_folder(&FOLDERID_Programs)
        .unwrap_or_else(|| env_or_empty("APPDATA").join(r"Microsoft\Windows\Start Menu\Programs"))
}

type GetTempPath2W = unsafe extern "system" fn(u32, *mut u16) -> u32;

/// `GetTempPath2W` (Windows 11 / Server 2022), looked up at run time; else `GetTempPathW`.
pub fn temp_dir() -> PathBuf {
    let mut buf = vec![0u16; 32768];
    let len = unsafe {
        let kernel32 = wide::to_wide("kernel32.dll".as_ref());
        let module = GetModuleHandleW(kernel32.as_ptr());
        let proc = if module.is_null() {
            None
        } else {
            GetProcAddress(module, c"GetTempPath2W".as_ptr().cast())
        };
        match proc {
            Some(f) => {
                let f: GetTempPath2W = std::mem::transmute(f);
                f(buf.len() as u32, buf.as_mut_ptr())
            }
            None => GetTempPathW(buf.len() as u32, buf.as_mut_ptr()),
        }
    };
    if len == 0 || len as usize > buf.len() {
        return std::env::temp_dir();
    }
    wide::path_from_buf(&buf[..len as usize])
}
