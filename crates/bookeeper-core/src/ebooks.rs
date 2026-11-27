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

    // Same bytes already stored under another extension (MOBI vs AZW3 is
    // decided by the name): reuse that copy instead of storing a second one.
    let format = [
        format,
        EbookFormat::Epub,
        EbookFormat::Pdf,
        EbookFormat::Mobi,
        EbookFormat::Azw3,
        EbookFormat::Fb2,
        EbookFormat::Cbz,
    ]
    .into_iter()
    .find(|f| dir.join(format!("{sha256}.{}", f.ext())).exists())
    .unwrap_or(format);
    let dest = dir.join(format!("{sha256}.{}", format.ext()));
    // Already stored: dropping the guard discards the duplicate, after the
    // stored file's mtime is refreshed so a sweep does not collect it right
    // after this upload. If it vanished meanwhile (a sweep), fall through and
    // move this copy into place instead.
    if let Ok(f) = std::fs::OpenOptions::new().write(true).open(&dest) {
        let _ = f.set_modified(std::time::SystemTime::now());
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
    attr_values(xml, "Algorithm")
        .into_iter()
        .map(|a| a.trim().to_string())
        .collect()
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

/// rbook reads `container.xml` and the whole OPF with an unbounded copy, so it
/// never sees the uploaded archive: it parses a small in-memory ZIP holding
/// only bounded copies of those entries. Anything over the caps gives `None`.
fn open_epub(path: &Path) -> Option<rbook::Epub> {
    use std::io::Write;
    let mut zip = zip::ZipArchive::new(File::open(path).ok()?).ok()?;
    let container = read_capped(&mut zip, EPUB_CONTAINER, MAX_CONTAINER_BYTES)?;
    let text = String::from_utf8_lossy(&container);
    let mut mini = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
    let opts =
        zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
    mini.start_file(EPUB_CONTAINER, opts).ok()?;
    mini.write_all(&container).ok()?;
    let mut total = 0u64;
    let mut added = HashSet::new();
    for full in attr_values(&text, "full-path") {
        // The attribute is XML text and may also be percent-encoded: the OPF
        // is copied under every spelling, so whichever one rbook asks for is
        // there, but read (and counted) once.
        let raw = full.trim_start_matches('/').to_string();
        let unescaped = xml_unescape(&raw);
        let decoded = percent_decode(&unescaped);
        let mut names = vec![raw, unescaped, decoded];
        names.dedup();
        names.retain(|n| n != EPUB_CONTAINER && !added.contains(n));
        let Some(opf) = names
            .iter()
            .find_map(|n| read_capped(&mut zip, n, MAX_OPF_BYTES))
        else {
            continue;
        };
        total += opf.len() as u64;
        if total > MAX_OPF_BYTES {
            return None;
        }
        for name in names {
            if added.insert(name.clone()) {
                mini.start_file(name, opts).ok()?;
                mini.write_all(&opf).ok()?;
            }
        }
    }
    let bytes = mini.finish().ok()?.into_inner();
    rbook::Epub::options()
        .skip_toc(true)
        .skip_spine(true)
        .read(std::io::Cursor::new(bytes))
        .ok()
}

const EPUB_CONTAINER: &str = "META-INF/container.xml";
const MAX_CONTAINER_BYTES: u64 = 1 << 20;
const MAX_OPF_BYTES: u64 = 16 << 20;

/// The whole entry, or `None` when missing or larger than `cap` once inflated
/// (the declared size is checked, and the read is bounded in case it lies).
fn read_capped(zip: &mut zip::ZipArchive<File>, name: &str, cap: u64) -> Option<Vec<u8>> {
    let entry = zip.by_name(name).ok()?;
    if entry.size() > cap {
        return None;
    }
    let mut out = Vec::new();
    entry.take(cap + 1).read_to_end(&mut out).ok()?;
    (out.len() as u64 <= cap).then_some(out)
}

/// The five predefined entities and numeric character references; anything
/// else is left as written.
fn xml_unescape(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    while let Some(i) = rest.find('&') {
        out.push_str(&rest[..i]);
        rest = &rest[i..];
        let Some(end) = rest.find(';') else { break };
        let ent = &rest[1..end];
        let ch = match ent {
            "amp" => Some('&'),
            "lt" => Some('<'),
            "gt" => Some('>'),
            "quot" => Some('"'),
            "apos" => Some('\''),
            _ => ent
                .strip_prefix("#x")
                .or_else(|| ent.strip_prefix("#X"))
                .map(|h| u32::from_str_radix(h, 16))
                .or_else(|| ent.strip_prefix('#').map(str::parse))
                .and_then(Result::ok)
                .and_then(char::from_u32),
        };
        match ch {
            Some(c) => {
                out.push(c);
                rest = &rest[end + 1..];
            }
            None => {
                out.push('&');
                rest = &rest[1..];
            }
        }
    }
    out.push_str(rest);
    out
}

/// `%XX` decoding; invalid escapes and non-UTF-8 results are left as written.
fn percent_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        let hex = |c: u8| (c as char).to_digit(16);
        if b[i] == b'%' && i + 2 < b.len() {
            if let (Some(h), Some(l)) = (hex(b[i + 1]), hex(b[i + 2])) {
                out.push((h * 16 + l) as u8);
                i += 3;
                continue;
            }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8(out).unwrap_or_else(|_| s.to_string())
}

/// Values of every `attr="…"` (or `'…'`) in `xml`.
fn attr_values<'a>(xml: &'a str, attr: &str) -> Vec<&'a str> {
    let mut out = Vec::new();
    let mut rest = xml;
    while let Some(i) = rest.find(attr) {
        rest = &rest[i + attr.len()..];
        let Some(t) = rest.trim_start().strip_prefix('=') else {
            continue;
        };
        let t = t.trim_start();
        let Some(q) = t.chars().next().filter(|c| *c == '"' || *c == '\'') else {
            continue;
        };
        let t = &t[1..];
        if let Some(end) = t.find(q) {
            out.push(&t[..end]);
            rest = &t[end..];
        }
    }
    out
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
    if std::fs::metadata(path).ok()?.len() > PDF_FULL_LOAD_MAX {
        return pdf_metadata_tail(path);
    }
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

/// Large PDFs: finds `/Info N G R` and the object itself in the last
/// `PDF_TAIL_BYTES`, never loading the whole file. Empty when not found there.
fn pdf_metadata_tail(path: &Path) -> Option<EbookMetadataRaw> {
    let mut f = File::open(path).ok()?;
    let len = f.metadata().ok()?.len();
    f.seek(SeekFrom::Start(len.saturating_sub(PDF_TAIL_BYTES)))
        .ok()?;
    let mut tail = Vec::new();
    f.take(PDF_TAIL_BYTES).read_to_end(&mut tail).ok()?;
    let at = rfind(&tail, b"/Info")? + 5;
    let mut it = tail[at..]
        .split(|b| b.is_ascii_whitespace())
        .filter(|t| !t.is_empty());
    let num = std::str::from_utf8(it.next()?).ok()?.parse::<u32>().ok()?;
    let gen_ = std::str::from_utf8(it.next()?).ok()?.parse::<u32>().ok()?;
    let head = format!("{num} {gen_} obj");
    // The header must start a token: "3 0 obj" also occurs inside "13 0 obj".
    let start = rfind_token(&tail, head.as_bytes())? + head.len();
    let body = &tail[start..];
    let end = find(body, b"endobj").unwrap_or(body.len());
    let dict = &body[..end];
    let authors = pdf_string(dict, b"/Author")
        .map(|a| a.split([';', '\n']).filter_map(clean).collect())
        .unwrap_or_default();
    Some(EbookMetadataRaw {
        title: pdf_string(dict, b"/Title").as_deref().and_then(clean),
        authors,
        description: pdf_string(dict, b"/Subject").as_deref().and_then(clean),
        ..Default::default()
    })
}

fn find(h: &[u8], n: &[u8]) -> Option<usize> {
    h.windows(n.len()).position(|w| w == n)
}

fn rfind(h: &[u8], n: &[u8]) -> Option<usize> {
    h.windows(n.len()).rposition(|w| w == n)
}

/// Last match of `n` at the start of `h` or right after whitespace.
fn rfind_token(h: &[u8], n: &[u8]) -> Option<usize> {
    h.windows(n.len())
        .enumerate()
        .rev()
        .find(|(i, w)| *w == n && (*i == 0 || h[i - 1].is_ascii_whitespace()))
        .map(|(i, _)| i)
}

/// Value of a literal `(..)` or hex `<..>` string key in a PDF dictionary.
fn pdf_string(dict: &[u8], key: &[u8]) -> Option<String> {
    let mut i = find(dict, key)? + key.len();
    while dict.get(i)?.is_ascii_whitespace() {
        i += 1;
    }
    let mut raw = Vec::new();
    match *dict.get(i)? {
        b'(' => {
            let mut depth = 0u32;
            let s = &dict[i..];
            let mut j = 0;
            while j < s.len() {
                let b = s[j];
                j += 1;
                match b {
                    b'\\' => {
                        let Some(&e) = s.get(j) else { break };
                        j += 1;
                        match e {
                            b'n' => raw.push(b'\n'),
                            b'r' => raw.push(b'\r'),
                            b't' => raw.push(b'\t'),
                            b'b' => raw.push(0x08),
                            b'f' => raw.push(0x0C),
                            b'0'..=b'7' => {
                                // Up to three octal digits; high-order overflow is ignored.
                                let mut v = u32::from(e - b'0');
                                for _ in 0..2 {
                                    match s.get(j) {
                                        Some(d @ b'0'..=b'7') => {
                                            v = v * 8 + u32::from(d - b'0');
                                            j += 1;
                                        }
                                        _ => break,
                                    }
                                }
                                raw.push(v as u8);
                            }
                            // Line continuation: backslash + EOL is dropped.
                            b'\r' => {
                                if s.get(j) == Some(&b'\n') {
                                    j += 1;
                                }
                            }
                            b'\n' => {}
                            o => raw.push(o),
                        }
                    }
                    b'(' => {
                        depth += 1;
                        if depth > 1 {
                            raw.push(b);
                        }
                    }
                    b')' => {
                        depth -= 1;
                        if depth == 0 {
                            break;
                        }
                        raw.push(b);
                    }
                    _ => raw.push(b),
                }
            }
        }
        b'<' => {
            let hex: Vec<u8> = dict[i + 1..]
                .iter()
                .copied()
                .take_while(|b| *b != b'>')
                .filter(|b| b.is_ascii_hexdigit())
                .collect();
            for p in hex.chunks(2) {
                let s = std::str::from_utf8(p).ok()?;
                raw.push(u8::from_str_radix(s, 16).ok()? << if p.len() == 1 { 4 } else { 0 });
            }
        }
        _ => return None,
    }
    if raw.starts_with(&[0xFE, 0xFF]) {
        let units: Vec<u16> = raw[2..]
            .chunks_exact(2)
            .map(|c| u16::from_be_bytes([c[0], c[1]]))
            .collect();
        Some(String::from_utf16_lossy(&units))
    } else if let Some(utf8) = raw.strip_prefix(&[0xEF, 0xBB, 0xBF]) {
        Some(String::from_utf8_lossy(utf8).into_owned())
    } else if let Ok(s) = std::str::from_utf8(&raw) {
        Some(s.to_string())
    } else {
        // PDFDocEncoding, approximated by Latin-1 (identical from 0xA0 up).
        Some(raw.iter().map(|&b| char::from(b)).collect())
    }
}

/// The EPUB cover image, `None` for other formats or when there is none.
pub fn extract_cover(path: &Path, format: EbookFormat) -> Option<Vec<u8>> {
    if format != EbookFormat::Epub {
        return None;
    }
    let epub = open_epub(path)?;
    let cover = epub.manifest().cover_image()?;
    let key = cover.resource();
    let key = key.key().value()?.trim_start_matches('/').to_string();
    let mut zip = zip::ZipArchive::new(File::open(path).ok()?).ok()?;
    let entry = zip.by_name(&key).ok()?;
    if entry.size() > MAX_COVER_BYTES {
        return None;
    }
    // Bounded read: the declared size can lie in a hostile archive.
    let mut out = Vec::new();
    entry.take(MAX_COVER_BYTES + 1).read_to_end(&mut out).ok()?;
    (out.len() as u64 <= MAX_COVER_BYTES).then_some(out)
}

const MAX_COVER_BYTES: u64 = 20 << 20;
/// Above this size the PDF is not loaded whole: `/Info` is read from the tail.
const PDF_FULL_LOAD_MAX: u64 = 8 << 20;
const PDF_TAIL_BYTES: u64 = 2 << 20;

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
        let Ok(entry) = entry else { continue };
        let name = entry.file_name().to_string_lossy().into_owned();
        let stale = if name.starts_with(TMP_PREFIX) {
            true
        } else if is_final_name(&name) {
            !referenced.contains(&name[..64].to_ascii_lowercase())
        } else {
            false
        };
        if !stale || !entry.file_type().is_ok_and(|t| t.is_file()) {
            continue;
        }
        let Ok(meta) = entry.metadata() else { continue };
        let age = meta
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
