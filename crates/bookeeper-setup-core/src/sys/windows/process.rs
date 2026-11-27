//! Running processes and elevation.

use std::io;
use std::mem::{size_of, zeroed};
use std::path::Path;

use windows_sys::Win32::Foundation::{CloseHandle, HANDLE, INVALID_HANDLE_VALUE};
use windows_sys::Win32::Security::{GetTokenInformation, TokenElevation, TOKEN_ELEVATION, TOKEN_QUERY};
use windows_sys::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
};
use windows_sys::Win32::System::Threading::{
    GetCurrentProcess, OpenProcess, OpenProcessToken, QueryFullProcessImageNameW,
    PROCESS_QUERY_LIMITED_INFORMATION,
};

use super::wide;

fn norm(s: &std::ffi::OsStr) -> String {
    s.to_string_lossy().replace('/', "\\").to_lowercase()
}

/// True when a process is running the executable at `exe` (paths compared ignoring case).
pub fn is_running(exe: &Path) -> io::Result<bool> {
    let want = norm(exe.as_os_str());
    let want_name = exe.file_name().map(norm).unwrap_or_default();
    // SAFETY: plain Win32 calls; every handle is closed.
    unsafe {
        let snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if snap == INVALID_HANDLE_VALUE {
            return Err(io::Error::last_os_error());
        }
        let mut entry: PROCESSENTRY32W = zeroed();
        entry.dwSize = size_of::<PROCESSENTRY32W>() as u32;
        let mut found = false;
        let mut more = Process32FirstW(snap, &mut entry) != 0;
        while more && !found {
            if norm(&wide::from_buf(&entry.szExeFile)) == want_name {
                found = image_path(entry.th32ProcessID).is_some_and(|p| p == want);
            }
            more = Process32NextW(snap, &mut entry) != 0;
        }
        CloseHandle(snap);
        Ok(found)
    }
}

unsafe fn image_path(pid: u32) -> Option<String> {
    let h: HANDLE = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
    if h.is_null() {
        return None;
    }
    let mut buf = vec![0u16; 32768];
    let mut len = buf.len() as u32;
    let ok = QueryFullProcessImageNameW(h, 0, buf.as_mut_ptr(), &mut len);
    CloseHandle(h);
    if ok == 0 {
        return None;
    }
    Some(norm(&wide::from_buf(&buf[..len as usize])))
}

pub fn is_elevated() -> bool {
    // SAFETY: the token handle is closed; the out struct matches the requested class.
    unsafe {
        let mut token: HANDLE = std::ptr::null_mut();
        if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) == 0 {
            return false;
        }
        let mut elevation = TOKEN_ELEVATION { TokenIsElevated: 0 };
        let mut ret = 0u32;
        let ok = GetTokenInformation(
            token,
            TokenElevation,
            &mut elevation as *mut _ as *mut _,
            size_of::<TOKEN_ELEVATION>() as u32,
            &mut ret,
        );
        CloseHandle(token);
        ok != 0 && elevation.TokenIsElevated != 0
    }
}
