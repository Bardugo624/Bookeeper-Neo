//! E-book files on disk: streaming storage, format detection, DRM check,
//! KOReader hash and metadata extraction.

use std::collections::HashSet;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::time::Duration;

use http_body_util::BodyExt;
use md5::Md5;
use sha2::{Digest, Sha256};
use tokio::io::AsyncWriteExt;

const HEAD_LEN: usize = 4096;
const TMP_PREFIX: &str = ".tmp-";
const FONT_ALGORITHMS: [&str; 2] = [
    "http://www.idpf.org/2008/embedding",
    "http://ns.adobe.com/pdf/enc#RC",
];

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum EbookFormat {
    Epub,
    Pdf,
    Mobi,
    Azw3,
    Fb2,
    Cbz,
}

impl EbookFormat {
    pub fn as_str(self) -> &'static str {
        match self {
            EbookFormat::Epub => "epub",
            EbookFormat::Pdf => "pdf",
            EbookFormat::Mobi => "mobi",
            EbookFormat::Azw3 => "azw3",
            EbookFormat::Fb2 => "fb2",
            EbookFormat::Cbz => "cbz",
        }
    }

    pub fn ext(self) -> &'static str {
        self.as_str()
    }

    pub fn mime(self) -> &'static str {
        match self {
            EbookFormat::Epub => "application/epub+zip",
            EbookFormat::Pdf => "application/pdf",
            EbookFormat::Mobi => "application/x-mobipocket-ebook",
            EbookFormat::Azw3 => "application/vnd.amazon.ebook",
            EbookFormat::Fb2 => "application/x-fictionbook+xml",
            EbookFormat::Cbz => "application/vnd.comicbook+zip",
        }
    }

    pub fn parse(s: &str) -> Option<EbookFormat> {
        [
            EbookFormat::Epub,
            EbookFormat::Pdf,
            EbookFormat::Mobi,
            EbookFormat::Azw3,
            EbookFormat::Fb2,
            EbookFormat::Cbz,
        ]
        .into_iter()
        .find(|f| f.as_str() == s)
    }

    /// Recognises the format from the first bytes; the file name's extension
    /// is only used when the bytes cannot tell (e.g. a ZIP, or MOBI vs AZW3).
    pub fn detect(head: &[u8], name: &str) -> Option<EbookFormat> {
        let ext = name
            .rsplit_once('.')
            .map(|(_, e)| e.to_ascii_lowercase())
            .unwrap_or_default();
        if head.starts_with(b"%PDF-") {
            return Some(EbookFormat::Pdf);
        }
        if head.len() >= 68 && &head[60..68] == b"BOOKMOBI" {
            return Some(if ext == "azw3" || ext == "azw" {
                EbookFormat::Azw3
            } else {
                EbookFormat::Mobi
            });
        }
        if head.starts_with(b"PK\x03\x04") {
            let is_epub = head.len() >= 58
                && &head[30..38] == b"mimetype"
                && head[38..].starts_with(b"application/epub+zip");
            if is_epub {
                return Some(EbookFormat::Epub);
            }
            return match ext.as_str() {
                "epub" => Some(EbookFormat::Epub),
                "cbz" => Some(EbookFormat::Cbz),
                _ => None,
            };
        }
        let text = head.strip_prefix(b"\xEF\xBB\xBF").unwrap_or(head);
        let trimmed: &[u8] = {
            let start = text
                .iter()
                .position(|b| !b.is_ascii_whitespace())
                .unwrap_or(text.len());
            &text[start..]
        };
        if trimmed.starts_with(b"<?xml") || trimmed.starts_with(b"<FictionBook") {
            let has_root = trimmed.windows(12).any(|w| w == b"<FictionBook");
            if has_root || ext == "fb2" {
                return Some(EbookFormat::Fb2);
            }
        }
        None
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Stored {
    pub sha256: String,
    pub size_bytes: u64,
    pub format: EbookFormat,
    pub koreader_hash: String,
}

#[derive(Debug, thiserror::Error)]
pub enum StoreError {
    #[error("file too large")]
    TooLarge,
    #[error("unsupported format")]
    Unsupported,
    #[error("file is DRM protected")]
    Drm,
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
}

/// Removes the temporary file unless disarmed (also on future cancellation).
struct TempGuard(Option<PathBuf>);

impl TempGuard {
    fn disarm(&mut self) {
        self.0 = None;
    }
}

impl Drop for TempGuard {
    fn drop(&mut self) {
        if let Some(p) = self.0.take() {
            let _ = std::fs::remove_file(p);
        }
    }
}

/// Streams `body` to a temporary file in `dir` computing sha256 and size, then
/// detects the format, checks DRM and moves the file to its final name.
pub async fn store_stream(
    dir: &Path,
    name: &str,
    mut body: axum::body::Body,
    max_bytes: u64,
) -> Result<Stored, StoreError> {
    let tmp = dir.join(format!("{TMP_PREFIX}{}", uuid::Uuid::now_v7()));
    let mut guard = TempGuard(Some(tmp.clone()));
    let mut file = tokio::fs::File::create(&tmp).await?;
    let mut hasher = Sha256::new();
    let mut size: u64 = 0;
    while let Some(frame) = body.frame().await {
        let frame = frame.map_err(std::io::Error::other)?;
        let Ok(data) = frame.into_data() else {
            continue;
        };
        size += data.len() as u64;
        if size > max_bytes {
            return Err(StoreError::TooLarge);
        }
        hasher.update(&data);
        file.write_all(&data).await?;
    }
    file.flush().await?;
    drop(file);
    let sha256 = hex::encode(hasher.finalize());

    let (tmp2, name2) = (tmp.clone(), name.to_string());
    let (format, koreader_hash) = tokio::task::spawn_blocking(move || inspect(&tmp2, &name2))
        .await
        .map_err(std::io::Error::other)??;

    let dest = dir.join(format!("{sha256}.{}", format.ext()));
    if dest.exists() {
        // Dropping the guard discards the duplicate.
        return Ok(Stored {
            sha256,
            size_bytes: size,
            format,
            koreader_hash,
        });
    }
    std::fs::rename(&tmp, &dest)?;
    guard.disarm();
    Ok(Stored {
        sha256,
        size_bytes: size,
        format,
        koreader_hash,
    })
}

fn inspect(path: &Path, name: &str) -> Result<(EbookFormat, String), StoreError> {
    let mut head = Vec::with_capacity(HEAD_LEN);
    File::open(path)?
        .take(HEAD_LEN as u64)
        .read_to_end(&mut head)?;
    let format = EbookFormat::detect(&head, name).ok_or(StoreError::Unsupported)?;
    let drm = match format {
        EbookFormat::Epub => epub_is_drm(path)?,
        EbookFormat::Pdf => pdf_is_encrypted(path)?,
        _ => false,
    };
    if drm {
        return Err(StoreError::Drm);
    }
    Ok((format, partial_md5(path)?))
}

fn epub_is_drm(path: &Path) -> Result<bool, StoreError> {
    let mut zip = zip::ZipArchive::new(File::open(path)?).map_err(|_| StoreError::Unsupported)?;
    if zip.by_name("META-INF/rights.xml").is_ok() {
        return Ok(true);
    }
    let Ok(entry) = zip.by_name("META-INF/encryption.xml") else {
        return Ok(false);
    };
    let mut xml = String::new();
    entry.take(1 << 20).read_to_string(&mut xml)?;
    Ok(encryption_algorithms(&xml)
        .iter()
        .any(|a| !FONT_ALGORITHMS.contains(&a.as_str())))
}

fn encryption_algorithms(xml: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut rest = xml;
    while let Some(i) = rest.find("Algorithm") {
        rest = &rest[i + "Algorithm".len()..];
        let t = rest.trim_start();
        let Some(t) = t.strip_prefix('=') else {
            continue;
        };
        let t = t.trim_start();
        let Some(q) = t.chars().next().filter(|c| *c == '"' || *c == '\'') else {
            continue;
        };
        let t = &t[1..];
        if let Some(end) = t.find(q) {
            out.push(t[..end].trim().to_string());
            rest = &t[end..];
        }
    }
    out
}

/// A PDF is protected when `/Encrypt` appears in a trailer: those sit at the
/// end of the file (or at the start, for linearized files).
fn pdf_is_encrypted(path: &Path) -> std::io::Result<bool> {
    let mut f = File::open(path)?;
    let len = f.metadata()?.len();
    let mut buf = Vec::new();
    (&mut f).take(8192).read_to_end(&mut buf)?;
    if contains(&buf, b"/Encrypt") {
        return Ok(true);
    }
    let tail = len.min(131_072);
    f.seek(SeekFrom::Start(len - tail))?;
    buf.clear();
    f.read_to_end(&mut buf)?;
    Ok(contains(&buf, b"/Encrypt"))
}

fn contains(hay: &[u8], needle: &[u8]) -> bool {
    hay.windows(needle.len()).any(|w| w == needle)
}

/// `<dir>/<sha256>.<ext>`, or `None` when `sha256` is not 64 hex digits.
pub fn ebook_path(dir: &Path, sha256: &str, format: EbookFormat) -> Option<PathBuf> {
    if sha256.len() == 64 && sha256.bytes().all(|b| b.is_ascii_hexdigit()) {
        Some(dir.join(format!("{}.{}", sha256.to_ascii_lowercase(), format.ext())))
    } else {
        None
    }
}

/// KOReader's `partialMD5`: MD5 over the 1024-byte samples at offsets 0 and
/// 1024 << 2i (i = 0..=10), stopping at the first offset past the end.
pub fn partial_md5(path: &Path) -> std::io::Result<String> {
    let mut f = File::open(path)?;
    let mut ctx = Md5::new();
    let mut buf = [0u8; 1024];
    let offsets = std::iter::once(0u64).chain((0..=10).map(|i| 1024u64 << (2 * i)));
    for off in offsets {
        f.seek(SeekFrom::Start(off))?;
        let mut got = 0;
        while got < buf.len() {
            let n = f.read(&mut buf[got..])?;
            if n == 0 {
                break;
            }
            got += n;
        }
        if got == 0 {
            break;
        }
        ctx.update(&buf[..got]);
    }
    Ok(hex::encode(ctx.finalize()))
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct EbookMetadataRaw {
    pub title: Option<String>,
    pub authors: Vec<String>,
    pub language: Option<String>,
    pub publisher: Option<String>,
    pub published_year: Option<i32>,
    pub isbn_13: Option<String>,
    pub description: Option<String>,
}

fn clean(s: &str) -> Option<String> {
    let t = s.trim();
    (!t.is_empty()).then(|| t.to_string())
}

/// Never fails: an unreadable file gives empty metadata.
pub fn read_metadata(path: &Path, format: EbookFormat) -> EbookMetadataRaw {
    match format {
        EbookFormat::Epub => epub_metadata(path).unwrap_or_default(),
        EbookFormat::Pdf => pdf_metadata(path).unwrap_or_default(),
        _ => EbookMetadataRaw::default(),
    }
}

fn open_epub(path: &Path) -> Option<rbook::Epub> {
    rbook::Epub::options()
        .skip_toc(true)
        .skip_spine(true)
        .open(path)
        .ok()
}

fn epub_metadata(path: &Path) -> Option<EbookMetadataRaw> {
    let epub = open_epub(path)?;
    let m = epub.metadata();
    let isbn_13 = m.identifiers().find_map(|i| isbn13_from(i.value()));
    let out = EbookMetadataRaw {
        title: m.title().and_then(|t| clean(t.value())),
        authors: m.creators().filter_map(|c| clean(c.value())).collect(),
        language: m.language().and_then(|l| clean(l.scheme().code())),
        publisher: m.publishers().find_map(|p| clean(p.value())),
        published_year: m.published().map(|d| d.date().year() as i32),
        isbn_13,
        description: m.description().and_then(|d| clean(d.value())),
    };
    Some(out)
}

fn pdf_metadata(path: &Path) -> Option<EbookMetadataRaw> {
    let m = lopdf::Document::load_metadata(path).ok()?;
    let authors = m
        .author
        .as_deref()
        .map(|a| a.split([';', '\n']).filter_map(clean).collect::<Vec<_>>())
        .unwrap_or_default();
    Some(EbookMetadataRaw {
        title: m.title.as_deref().and_then(clean),
        authors,
        description: m.subject.as_deref().and_then(clean),
        ..Default::default()
    })
}

/// The EPUB cover image, `None` for other formats or when there is none.
pub fn extract_cover(path: &Path, format: EbookFormat) -> Option<Vec<u8>> {
    if format != EbookFormat::Epub {
        return None;
    }
    let epub = open_epub(path)?;
    let cover = epub.manifest().cover_image()?;
    cover.read_bytes().ok()
}

fn isbn13_from(raw: &str) -> Option<String> {
    let digits: String = raw
        .chars()
        .filter(|c| c.is_ascii_digit() || *c == 'X' || *c == 'x')
        .collect();
    let d: Vec<u32> = digits
        .chars()
        .map(|c| c.to_digit(10).unwrap_or(10))
        .collect();
    match d.len() {
        13 if (digits.starts_with("978") || digits.starts_with("979"))
            && d.iter().all(|x| *x < 10) =>
        {
            let sum: u32 = d
                .iter()
                .enumerate()
                .map(|(i, x)| if i % 2 == 0 { *x } else { 3 * x })
                .sum();
            sum.is_multiple_of(10).then_some(digits)
        }
        10 if d[..9].iter().all(|x| *x < 10) && d[9] <= 10 => {
            let sum: u32 = d.iter().enumerate().map(|(i, x)| (10 - i as u32) * x).sum();
            if !sum.is_multiple_of(11) {
                return None;
            }
            let mut body: Vec<u32> = vec![9, 7, 8];
            body.extend(&d[..9]);
            let s: u32 = body
                .iter()
                .enumerate()
                .map(|(i, x)| if i % 2 == 0 { *x } else { 3 * x })
                .sum();
            let check = (10 - s % 10) % 10;
            body.push(check);
            Some(body.iter().map(|x| x.to_string()).collect())
        }
        _ => None,
    }
}

fn is_final_name(name: &str) -> bool {
    let Some((stem, ext)) = name.rsplit_once('.') else {
        return false;
    };
    stem.len() == 64
        && stem.bytes().all(|b| b.is_ascii_hexdigit())
        && EbookFormat::parse(ext).is_some()
}

/// Deletes stored files not in `referenced` (a set of sha256) and orphaned
/// temporaries, both only when older than `older_than`. Returns how many.
pub fn sweep_staged(
    dir: &Path,
    referenced: &HashSet<String>,
    older_than: Duration,
) -> std::io::Result<usize> {
    let mut removed = 0;
    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().into_owned();
        let stale = if name.starts_with(TMP_PREFIX) {
            true
        } else if is_final_name(&name) {
            !referenced.contains(&name[..64].to_ascii_lowercase())
        } else {
            false
        };
        if !stale || !entry.file_type()?.is_file() {
            continue;
        }
        let age = entry
            .metadata()?
            .modified()
            .ok()
            .and_then(|m| m.elapsed().ok())
            .unwrap_or_default();
        if age >= older_than && std::fs::remove_file(entry.path()).is_ok() {
            removed += 1;
        }
    }
    Ok(removed)
}
