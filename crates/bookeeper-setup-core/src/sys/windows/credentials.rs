//! Windows Credential Manager cleanup.

use std::io;
use std::ptr::null;

use windows_sys::Win32::Security::Credentials::{
    CredDeleteW, CredEnumerateW, CredFree, CREDENTIALW,
};

use super::wide;

const ERROR_NOT_FOUND: i32 = 1168;

/// Deletes every credential whose target name ends with `suffix` (ignoring case).
pub fn delete_with_suffix(suffix: &str) -> io::Result<usize> {
    let suffix = suffix.to_lowercase();
    let mut count = 0u32;
    let mut list: *mut *mut CREDENTIALW = std::ptr::null_mut();
    // SAFETY: with no filter and flags 0 the call returns an array we release with CredFree.
    let ok = unsafe { CredEnumerateW(null(), 0, &mut count, &mut list) };
    if ok == 0 {
        let err = io::Error::last_os_error();
        return if err.raw_os_error() == Some(ERROR_NOT_FOUND) {
            Ok(0)
        } else {
            Err(err)
        };
    }
    let mut targets: Vec<(Vec<u16>, u32)> = Vec::new();
    // SAFETY: `list` holds `count` valid pointers until CredFree.
    unsafe {
        for i in 0..count as usize {
            let cred = &**list.add(i);
            if cred.TargetName.is_null() {
                continue;
            }
            let name = wide::from_ptr(cred.TargetName);
            if name.to_string_lossy().to_lowercase().ends_with(&suffix) {
                targets.push((wide::to_wide(&name), cred.Type));
            }
        }
        CredFree(list as *const _);
    }
    let mut deleted = 0;
    for (name, kind) in targets {
        // SAFETY: `name` is NUL-terminated.
        if unsafe { CredDeleteW(name.as_ptr(), kind, 0) } != 0 {
            deleted += 1;
        }
    }
    Ok(deleted)
}
