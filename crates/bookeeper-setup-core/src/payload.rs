//! The downloadable file: `setup.exe ‖ NSIS installer ‖ metadata ‖ tail`.
//!
//! Tail (24 bytes) = `"BKSETUP1"` ‖ metadata length (u32 LE) ‖ installer length (u64 LE) ‖ 4 zero bytes.

use serde::{Deserialize, Serialize};
use std::io::{Read, Seek, SeekFrom};

pub const MAGIC: &[u8; 8] = b"BKSETUP1";
pub const TAIL_LEN: u64 = 24;
/// Metadata is a small JSON object; anything bigger is garbage.
const MAX_META_LEN: u32 = 1024 * 1024;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FileMeta {
    pub name: String,
    pub bytes: u64,
    pub sha256: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Meta {
    pub version: String,
    pub payload: FileMeta,
    pub main: FileMeta,
    pub installed_bytes: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Located {
    pub meta: Meta,
    pub payload_offset: u64,
    pub payload_len: u64,
}

#[derive(Debug, thiserror::Error)]
pub enum PayloadError {
    #[error("tail lengths fall outside the file")]
    BadLengths,
    #[error("bad metadata: {0}")]
    BadMeta(String),
    #[error(transparent)]
    Io(#[from] std::io::Error),
}

/// Metadata followed by the 24-byte tail, ready to append after the installer.
pub fn encode_tail(meta: &Meta, payload_len: u64) -> Vec<u8> {
    let json = serde_json::to_vec(meta).expect("Meta always serializes");
    let mut out = json.clone();
    out.extend_from_slice(MAGIC);
    out.extend_from_slice(&(json.len() as u32).to_le_bytes());
    out.extend_from_slice(&payload_len.to_le_bytes());
    out.extend_from_slice(&[0u8; 4]);
    out
}

/// Parses a buffer that ends with `metadata ‖ tail` (no installer bytes needed).
/// Returns the metadata and the installer length. `None` when the magic is missing.
pub fn decode_tail(buf: &[u8]) -> Result<Option<(Meta, u64)>, PayloadError> {
    let Some(tail_start) = buf.len().checked_sub(TAIL_LEN as usize) else {
        return Ok(None);
    };
    let (meta_len, payload_len) = match parse_tail(&buf[tail_start..]) {
        Some(t) => t,
        None => return Ok(None),
    };
    let meta_start = tail_start
        .checked_sub(meta_len as usize)
        .ok_or(PayloadError::BadLengths)?;
    let meta = parse_meta(&buf[meta_start..tail_start], payload_len)?;
    Ok(Some((meta, payload_len)))
}

fn parse_tail(tail: &[u8]) -> Option<(u32, u64)> {
    if tail.len() != TAIL_LEN as usize || &tail[..8] != MAGIC {
        return None;
    }
    let meta_len = u32::from_le_bytes(tail[8..12].try_into().ok()?);
    let payload_len = u64::from_le_bytes(tail[12..20].try_into().ok()?);
    Some((meta_len, payload_len))
}

fn parse_meta(json: &[u8], payload_len: u64) -> Result<Meta, PayloadError> {
    let meta: Meta =
        serde_json::from_slice(json).map_err(|e| PayloadError::BadMeta(e.to_string()))?;
    if meta.payload.bytes != payload_len {
        return Err(PayloadError::BadLengths);
    }
    Ok(meta)
}

/// Finds the tail of a file of `len` bytes. With an Authenticode certificate table
/// at the very end, the tail sits right before it.
pub fn locate<R: Read + Seek>(r: &mut R, len: u64) -> Result<Option<Located>, PayloadError> {
    let end = certificate_start(r, len)?.unwrap_or(len);
    if end < TAIL_LEN {
        return Ok(None);
    }
    let mut tail = [0u8; TAIL_LEN as usize];
    r.seek(SeekFrom::Start(end - TAIL_LEN))?;
    r.read_exact(&mut tail)?;
    let Some((meta_len, payload_len)) = parse_tail(&tail) else {
        return Ok(None);
    };
    if meta_len > MAX_META_LEN {
        return Err(PayloadError::BadLengths);
    }
    let body = end - TAIL_LEN;
    let after_payload = body
        .checked_sub(u64::from(meta_len))
        .ok_or(PayloadError::BadLengths)?;
    let payload_offset = after_payload
        .checked_sub(payload_len)
        .ok_or(PayloadError::BadLengths)?;
    let mut json = vec![0u8; meta_len as usize];
    r.seek(SeekFrom::Start(after_payload))?;
    r.read_exact(&mut json)?;
    let meta = parse_meta(&json, payload_len)?;
    Ok(Some(Located { meta, payload_offset, payload_len }))
}

/// Start of the PE certificate table, if the file is a PE whose table ends at the
/// end of the file (up to 7 bytes of 8-byte alignment padding).
fn certificate_start<R: Read + Seek>(r: &mut R, len: u64) -> Result<Option<u64>, PayloadError> {
    if len < 0x40 {
        return Ok(None);
    }
    let mut dos = [0u8; 0x40];
    r.seek(SeekFrom::Start(0))?;
    r.read_exact(&mut dos)?;
    if &dos[..2] != b"MZ" {
        return Ok(None);
    }
    let pe = u64::from(u32::from_le_bytes(dos[0x3c..0x40].try_into().unwrap()));
    // "PE\0\0", COFF header (20 bytes), then the optional header.
    if pe.checked_add(24 + 2).is_none_or(|n| n > len) {
        return Ok(None);
    }
    let mut head = [0u8; 26];
    r.seek(SeekFrom::Start(pe))?;
    r.read_exact(&mut head)?;
    if &head[..4] != b"PE\0\0" {
        return Ok(None);
    }
    let dirs_offset: u64 = match u16::from_le_bytes([head[24], head[25]]) {
        0x10b => 96,
        0x20b => 112,
        _ => return Ok(None),
    };
    // Security directory is data directory #4, 8 bytes each.
    let entry = pe + 24 + dirs_offset + 4 * 8;
    if entry + 8 > len {
        return Ok(None);
    }
    let mut dir = [0u8; 8];
    r.seek(SeekFrom::Start(entry))?;
    r.read_exact(&mut dir)?;
    let off = u64::from(u32::from_le_bytes(dir[..4].try_into().unwrap()));
    let size = u64::from(u32::from_le_bytes(dir[4..].try_into().unwrap()));
    if off == 0 || size == 0 {
        return Ok(None);
    }
    let table_end = off.saturating_add(size);
    if table_end <= len && len - table_end < 8 {
        // Signing tools pad with up to 7 zero bytes before the table so it starts on
        // an 8-byte boundary: the tail may end that many bytes before `off`.
        let mut end = off;
        let mut zeros = [0u8; 7];
        let pad = off.min(7) as usize;
        r.seek(SeekFrom::Start(off - pad as u64))?;
        r.read_exact(&mut zeros[..pad])?;
        let mut tail = [0u8; TAIL_LEN as usize];
        let has_tail = |r: &mut R, at: u64, tail: &mut [u8]| -> Result<bool, PayloadError> {
            if at < TAIL_LEN {
                return Ok(false);
            }
            r.seek(SeekFrom::Start(at - TAIL_LEN))?;
            r.read_exact(tail)?;
            Ok(parse_tail(tail).is_some())
        };
        if !has_tail(r, off, &mut tail)? {
            for n in 1..=pad {
                if zeros[pad - n..].iter().all(|b| *b == 0) && has_tail(r, off - n as u64, &mut tail)? {
                    end = off - n as u64;
                    break;
                }
            }
        }
        Ok(Some(end))
    } else {
        Ok(None)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    fn sample(payload_len: u64) -> Meta {
        Meta {
            version: "2.2.0".into(),
            payload: FileMeta {
                name: "Bookeeper_2.2.0_x64-setup.exe".into(),
                bytes: payload_len,
                sha256: "ab".repeat(32),
            },
            main: FileMeta {
                name: "bookeeper-desktop.exe".into(),
                bytes: 4096,
                sha256: "cd".repeat(32),
            },
            installed_bytes: 41_000_000,
        }
    }

    fn file(setup: &[u8], payload: &[u8]) -> Vec<u8> {
        let mut f = setup.to_vec();
        f.extend_from_slice(payload);
        f.extend(encode_tail(&sample(payload.len() as u64), payload.len() as u64));
        f
    }

    #[test]
    fn locate_reads_tail_written_by_encode_tail() {
        let f = file(b"SETUP-BYTES", b"installer-bytes");
        let found = locate(&mut Cursor::new(&f), f.len() as u64).unwrap().unwrap();
        assert_eq!(found.meta, sample(15));
        assert_eq!(found.payload_offset, 11);
        assert_eq!(found.payload_len, 15);
        assert_eq!(&f[11..26], b"installer-bytes");
    }

    #[test]
    fn locate_returns_none_without_magic() {
        let f = vec![7u8; 500];
        assert!(locate(&mut Cursor::new(&f), 500).unwrap().is_none());
        let tiny = vec![1u8; 5];
        assert!(locate(&mut Cursor::new(&tiny), 5).unwrap().is_none());
    }

    #[test]
    fn locate_rejects_lengths_outside_file() {
        // Installer length larger than the file.
        let mut f = b"xx".to_vec();
        f.extend(encode_tail(&sample(1_000_000), 1_000_000));
        let r = locate(&mut Cursor::new(&f), f.len() as u64);
        assert!(matches!(r, Err(PayloadError::BadLengths)));

        // Metadata length larger than the file.
        let mut f = vec![0u8; 30];
        f.extend_from_slice(MAGIC);
        f.extend_from_slice(&u32::MAX.to_le_bytes());
        f.extend_from_slice(&0u64.to_le_bytes());
        f.extend_from_slice(&[0u8; 4]);
        let r = locate(&mut Cursor::new(&f), f.len() as u64);
        assert!(matches!(r, Err(PayloadError::BadLengths)));

        // Metadata that disagrees with the tail.
        let mut f = b"abc".to_vec();
        f.extend(encode_tail(&sample(99), 3));
        let r = locate(&mut Cursor::new(&f), f.len() as u64);
        assert!(matches!(r, Err(PayloadError::BadLengths)));
    }

    #[test]
    fn locate_rejects_garbage_metadata() {
        let mut f = b"garbage!".to_vec();
        f.extend_from_slice(MAGIC);
        f.extend_from_slice(&8u32.to_le_bytes());
        f.extend_from_slice(&0u64.to_le_bytes());
        f.extend_from_slice(&[0u8; 4]);
        let r = locate(&mut Cursor::new(&f), f.len() as u64);
        assert!(matches!(r, Err(PayloadError::BadMeta(_))));
    }

    /// A minimal PE32+ whose security directory is patched after the fact.
    fn minimal_pe() -> Vec<u8> {
        let pe_off = 0x80usize;
        let mut h = vec![0u8; 0x400];
        h[..2].copy_from_slice(b"MZ");
        h[0x3c..0x40].copy_from_slice(&(pe_off as u32).to_le_bytes());
        h[pe_off..pe_off + 4].copy_from_slice(b"PE\0\0");
        let opt = pe_off + 24;
        h[opt..opt + 2].copy_from_slice(&0x20bu16.to_le_bytes());
        h
    }

    #[test]
    fn locate_finds_tail_before_certificate_table() {
        let mut f = minimal_pe();
        let setup_len = f.len();
        f.extend_from_slice(b"installer");
        f.extend(encode_tail(&sample(9), 9));
        let cert_off = f.len();
        let cert = vec![0xAAu8; 40];
        f.extend_from_slice(&cert);
        let dir = 0x80 + 24 + 112 + 4 * 8;
        f[dir..dir + 4].copy_from_slice(&(cert_off as u32).to_le_bytes());
        f[dir + 4..dir + 8].copy_from_slice(&(cert.len() as u32).to_le_bytes());

        let found = locate(&mut Cursor::new(&f), f.len() as u64).unwrap().unwrap();
        assert_eq!(found.payload_offset, setup_len as u64);
        assert_eq!(found.payload_len, 9);

        // Without the directory entry the certificate bytes hide the tail.
        f[dir..dir + 8].fill(0);
        assert!(locate(&mut Cursor::new(&f), f.len() as u64).unwrap().is_none());
    }

    #[test]
    fn locate_finds_tail_when_signer_pads_before_certificate_table() {
        let mut f = minimal_pe();
        let setup_len = f.len();
        f.extend_from_slice(b"installer");
        f.extend(encode_tail(&sample(9), 9));
        f.extend_from_slice(&[0, 0, 0]);
        let cert_off = f.len();
        let cert = vec![0xAAu8; 40];
        f.extend_from_slice(&cert);
        let dir = 0x80 + 24 + 112 + 4 * 8;
        f[dir..dir + 4].copy_from_slice(&(cert_off as u32).to_le_bytes());
        f[dir + 4..dir + 8].copy_from_slice(&(cert.len() as u32).to_le_bytes());
        let found = locate(&mut Cursor::new(&f), f.len() as u64).unwrap().unwrap();
        assert_eq!(found.payload_offset, setup_len as u64);
    }

    #[test]
    fn decode_tail_matches_fixture() {
        let meta = sample(1234);
        let bytes = encode_tail(&meta, 1234);
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/tail.bin");
        if std::env::var_os("UPDATE_FIXTURE").is_some() {
            std::fs::write(path, &bytes).unwrap();
        }
        let on_disk = std::fs::read(path).unwrap();
        assert_eq!(on_disk, bytes);
        assert_eq!(decode_tail(&on_disk).unwrap(), Some((meta, 1234)));
        assert!(decode_tail(b"short").unwrap().is_none());
    }
}
