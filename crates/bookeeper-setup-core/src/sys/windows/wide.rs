//! UTF-16 helpers.

use std::ffi::{OsStr, OsString};
use std::os::windows::ffi::{OsStrExt, OsStringExt};
use std::path::PathBuf;

/// NUL-terminated UTF-16 copy of `s`.
pub fn to_wide(s: &OsStr) -> Vec<u16> {
    s.encode_wide().chain(std::iter::once(0)).collect()
}

/// Reads a NUL-terminated UTF-16 string.
///
/// # Safety
/// `p` must be non-null and point to a NUL-terminated buffer.
pub unsafe fn from_ptr(p: *const u16) -> OsString {
    let mut len = 0;
    while *p.add(len) != 0 {
        len += 1;
    }
    OsString::from_wide(std::slice::from_raw_parts(p, len))
}

/// The part of `buf` before the first NUL.
pub fn from_buf(buf: &[u16]) -> OsString {
    let len = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
    OsString::from_wide(&buf[..len])
}

pub fn path_from_buf(buf: &[u16]) -> PathBuf {
    PathBuf::from(from_buf(buf))
}
