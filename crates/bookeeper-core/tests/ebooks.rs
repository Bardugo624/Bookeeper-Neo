use std::collections::HashSet;
use std::io::Write;
use std::path::Path;
use std::time::Duration;

use bookeeper_core::ebooks::{
    ebook_path, extract_cover, partial_md5, read_metadata, store_stream, sweep_staged, EbookFormat,
    StoreError,
};
use md5::{Digest, Md5};
use sha2::Sha256;
use zip::write::SimpleFileOptions;
use zip::CompressionMethod;

const COVER: &[u8] = b"\x89PNG\r\n\x1a\nfake-cover-bytes";

fn epub_with(extra: &[(&str, &str)]) -> Vec<u8> {
    epub_at("OEBPS/content.opf", "OEBPS/content.opf", extra)
}

/// `attr` is the raw `full-path` text in `container.xml`; `entry` the OPF's
/// name in the archive.
fn epub_at(attr: &str, entry: &str, extra: &[(&str, &str)]) -> Vec<u8> {
    let mut buf = std::io::Cursor::new(Vec::new());
    {
        let mut z = zip::ZipWriter::new(&mut buf);
        let stored = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
        let deflated = SimpleFileOptions::default();
        z.start_file("mimetype", stored).unwrap();
        z.write_all(b"application/epub+zip").unwrap();
        z.start_file("META-INF/container.xml", deflated).unwrap();
        z.write_all(
            format!(r#"<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="{attr}" media-type="application/oebps-package+xml"/></rootfiles></container>"#)
                .as_bytes(),
        )
        .unwrap();
        z.start_file(entry, deflated).unwrap();
        z.write_all(
            br#"<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
 <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
  <dc:identifier id="id">urn:isbn:9780306406157</dc:identifier>
  <dc:title>Il nome della rosa</dc:title>
  <dc:creator>Umberto Eco</dc:creator>
  <dc:creator>Altro Autore</dc:creator>
  <dc:language>it</dc:language>
  <dc:publisher>Bompiani</dc:publisher>
  <dc:date>1980-05-01</dc:date>
  <dc:description>Un giallo medievale.</dc:description>
  <meta property="dcterms:modified">2020-01-01T00:00:00Z</meta>
 </metadata>
 <manifest>
  <item id="c" href="cover.png" media-type="image/png" properties="cover-image"/>
  <item id="p1" href="p1.xhtml" media-type="application/xhtml+xml"/>
 </manifest>
 <spine><itemref idref="p1"/></spine>
</package>"#,
        )
        .unwrap();
        z.start_file("OEBPS/cover.png", deflated).unwrap();
        z.write_all(COVER).unwrap();
        z.start_file("OEBPS/p1.xhtml", deflated).unwrap();
        z.write_all(b"<html xmlns=\"http://www.w3.org/1999/xhtml\"><body>x</body></html>")
            .unwrap();
        for (name, body) in extra {
            z.start_file(*name, deflated).unwrap();
            z.write_all(body.as_bytes()).unwrap();
        }
        z.finish().unwrap();
    }
    buf.into_inner()
}

fn pdf(encrypt: bool) -> Vec<u8> {
    let enc = if encrypt { " /Encrypt 9 0 R" } else { "" };
    format!(
        "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n\
         2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\n\
         3 0 obj\n<< /Title (Dune) /Author (Frank Herbert; Brian Herbert) /Subject (Sci-fi) >>\nendobj\n\
         trailer\n<< /Root 1 0 R /Info 3 0 R /Size 4{enc} >>\nstartxref\n0\n%%EOF\n"
    )
    .into_bytes()
}

fn body(bytes: Vec<u8>) -> axum::body::Body {
    axum::body::Body::from(bytes)
}

fn write(dir: &Path, name: &str, bytes: &[u8]) -> std::path::PathBuf {
    let p = dir.join(name);
    std::fs::write(&p, bytes).unwrap();
    p
}

fn names(dir: &Path) -> Vec<String> {
    let mut v: Vec<String> = std::fs::read_dir(dir)
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
        .collect();
    v.sort();
    v
}

#[test]
fn detect_recognises_formats_from_bytes() {
    let epub = epub_with(&[]);
    assert_eq!(EbookFormat::detect(&epub, "x.bin"), Some(EbookFormat::Epub));
    assert_eq!(
        EbookFormat::detect(b"%PDF-1.7\n...", "x"),
        Some(EbookFormat::Pdf)
    );
    let mut mobi = vec![0u8; 100];
    mobi[60..68].copy_from_slice(b"BOOKMOBI");
    assert_eq!(
        EbookFormat::detect(&mobi, "a.mobi"),
        Some(EbookFormat::Mobi)
    );
    assert_eq!(
        EbookFormat::detect(&mobi, "a.azw3"),
        Some(EbookFormat::Azw3)
    );
    assert_eq!(
        EbookFormat::detect(b"<?xml version=\"1.0\"?><FictionBook xmlns=\"x\">", "a.xml"),
        Some(EbookFormat::Fb2)
    );
    let cbz = b"PK\x03\x04\x14\x00\x00\x00\x00\x00rest-of-zip";
    assert_eq!(EbookFormat::detect(cbz, "c.cbz"), Some(EbookFormat::Cbz));
    assert_eq!(EbookFormat::detect(cbz, "c.zip"), None);
    assert_eq!(EbookFormat::detect(b"just some text\n", "a.txt"), None);
    assert_eq!(EbookFormat::detect(b"", "a.epub"), None);
}

#[test]
fn format_table_matches_the_contract() {
    assert_eq!(EbookFormat::Cbz.mime(), "application/vnd.comicbook+zip");
    assert_eq!(EbookFormat::Azw3.ext(), "azw3");
    assert_eq!(EbookFormat::Fb2.as_str(), "fb2");
}

fn reference_md5(data: &[u8]) -> String {
    let mut ctx = Md5::new();
    let mut offsets = vec![0usize];
    offsets.extend((0..=10).map(|i| 1024usize << (2 * i)));
    for off in offsets {
        if off >= data.len() {
            break;
        }
        ctx.update(&data[off..data.len().min(off + 1024)]);
    }
    hex::encode(ctx.finalize())
}

#[test]
fn partial_md5_matches_an_independent_computation() {
    let dir = tempfile::tempdir().unwrap();
    let small: Vec<u8> = (0..3 * 1024).map(|i| (i * 7 % 251) as u8).collect();
    let big: Vec<u8> = (0..2 * 1024 * 1024 + 100)
        .map(|i| (i * 13 % 253) as u8)
        .collect();
    for data in [small, big] {
        let p = write(dir.path(), "f.bin", &data);
        assert_eq!(partial_md5(&p).unwrap(), reference_md5(&data));
    }
    // Empty file: MD5 of nothing.
    let p = write(dir.path(), "e.bin", b"");
    assert_eq!(partial_md5(&p).unwrap(), "d41d8cd98f00b204e9800998ecf8427e");
}

#[tokio::test]
async fn store_stream_hashes_names_and_deduplicates() {
    let dir = tempfile::tempdir().unwrap();
    let data = epub_with(&[]);
    let sha = hex::encode(Sha256::digest(&data));
    let a = store_stream(dir.path(), "rosa.epub", body(data.clone()), 1 << 20)
        .await
        .unwrap();
    assert_eq!(a.sha256, sha);
    assert_eq!(a.size_bytes, data.len() as u64);
    assert_eq!(a.format, EbookFormat::Epub);
    assert_eq!(a.koreader_hash, reference_md5(&data));
    let path = ebook_path(dir.path(), &sha, EbookFormat::Epub).unwrap();
    assert_eq!(std::fs::read(&path).unwrap(), data);
    let b = store_stream(dir.path(), "again.epub", body(data), 1 << 20)
        .await
        .unwrap();
    assert_eq!(a, b);
    assert_eq!(names(dir.path()), vec![format!("{sha}.epub")]);
}

#[tokio::test]
async fn store_stream_rejects_oversize_unsupported_and_leaves_nothing() {
    let dir = tempfile::tempdir().unwrap();
    let data = epub_with(&[]);
    let r = store_stream(dir.path(), "r.epub", body(data.clone()), 100).await;
    assert!(matches!(r, Err(StoreError::TooLarge)));
    let r = store_stream(dir.path(), "r.txt", body(b"plain text".to_vec()), 1 << 20).await;
    assert!(matches!(r, Err(StoreError::Unsupported)));
    assert!(names(dir.path()).is_empty());
}

#[tokio::test]
async fn drm_is_detected_but_font_obfuscation_is_not() {
    let dir = tempfile::tempdir().unwrap();
    let rights = epub_with(&[("META-INF/rights.xml", "<rights/>")]);
    let r = store_stream(dir.path(), "a.epub", body(rights), 1 << 20).await;
    assert!(matches!(r, Err(StoreError::Drm)));

    let enc = |alg: &str| {
        format!(
            r#"<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:enc="http://www.w3.org/2001/04/xmlenc#"><enc:EncryptedData><enc:EncryptionMethod Algorithm="{alg}"/><enc:CipherData><enc:CipherReference URI="OEBPS/f.otf"/></enc:CipherData></enc:EncryptedData></encryption>"#
        )
    };
    let fonts = epub_with(&[(
        "META-INF/encryption.xml",
        &enc("http://www.idpf.org/2008/embedding"),
    )]);
    let ok = store_stream(dir.path(), "f.epub", body(fonts), 1 << 20).await;
    assert!(ok.is_ok());
    let aes = epub_with(&[(
        "META-INF/encryption.xml",
        &enc("http://www.w3.org/2001/04/xmlenc#aes128-cbc"),
    )]);
    let r = store_stream(dir.path(), "g.epub", body(aes), 1 << 20).await;
    assert!(matches!(r, Err(StoreError::Drm)));

    let r = store_stream(dir.path(), "e.pdf", body(pdf(true)), 1 << 20).await;
    assert!(matches!(r, Err(StoreError::Drm)));
    let ok = store_stream(dir.path(), "p.pdf", body(pdf(false)), 1 << 20).await;
    assert_eq!(ok.unwrap().format, EbookFormat::Pdf);
    // Only the two accepted files remain.
    assert_eq!(names(dir.path()).len(), 2);
}

#[test]
fn metadata_and_cover_come_from_the_epub() {
    let dir = tempfile::tempdir().unwrap();
    let p = write(dir.path(), "b.epub", &epub_with(&[]));
    let m = read_metadata(&p, EbookFormat::Epub);
    assert_eq!(m.title.as_deref(), Some("Il nome della rosa"));
    assert_eq!(m.authors, vec!["Umberto Eco", "Altro Autore"]);
    assert_eq!(m.language.as_deref(), Some("it"));
    assert_eq!(m.publisher.as_deref(), Some("Bompiani"));
    assert_eq!(m.published_year, Some(1980));
    assert_eq!(m.isbn_13.as_deref(), Some("9780306406157"));
    assert_eq!(m.description.as_deref(), Some("Un giallo medievale."));
    assert_eq!(extract_cover(&p, EbookFormat::Epub).as_deref(), Some(COVER));
    assert_eq!(extract_cover(&p, EbookFormat::Pdf), None);
}

#[test]
fn an_escaped_rootfile_path_still_finds_the_opf() {
    let dir = tempfile::tempdir().unwrap();
    for (i, attr) in [
        "OEBPS/a&amp;b c.opf",
        "OEBPS/a%26b%20c.opf",
        "OEBPS/a&#38;b&#x20;c.opf",
    ]
    .iter()
    .enumerate()
    {
        let p = write(
            dir.path(),
            &format!("e{i}.epub"),
            &epub_at(attr, "OEBPS/a&b c.opf", &[]),
        );
        let m = read_metadata(&p, EbookFormat::Epub);
        assert_eq!(m.title.as_deref(), Some("Il nome della rosa"), "{attr}");
        assert_eq!(
            extract_cover(&p, EbookFormat::Epub).as_deref(),
            Some(COVER),
            "{attr}"
        );
    }
}

#[test]
fn metadata_of_a_pdf_and_of_garbage() {
    let dir = tempfile::tempdir().unwrap();
    let p = write(dir.path(), "d.pdf", &pdf(false));
    let m = read_metadata(&p, EbookFormat::Pdf);
    assert_eq!(m.title.as_deref(), Some("Dune"));
    assert_eq!(m.authors, vec!["Frank Herbert", "Brian Herbert"]);
    let junk = write(dir.path(), "j.epub", b"not a zip");
    assert_eq!(read_metadata(&junk, EbookFormat::Epub), Default::default());
    assert_eq!(read_metadata(&junk, EbookFormat::Pdf), Default::default());
    assert_eq!(read_metadata(&junk, EbookFormat::Mobi), Default::default());
    assert_eq!(
        read_metadata(&dir.path().join("missing"), EbookFormat::Epub),
        Default::default()
    );
    assert_eq!(extract_cover(&junk, EbookFormat::Epub), None);
}

#[test]
fn ebook_path_requires_a_full_hex_digest() {
    let d = Path::new("/x");
    assert!(ebook_path(d, &"a".repeat(64), EbookFormat::Pdf).is_some());
    assert!(ebook_path(d, &"a".repeat(63), EbookFormat::Pdf).is_none());
    assert!(ebook_path(d, &format!("{}/", "a".repeat(63)), EbookFormat::Pdf).is_none());
    assert!(ebook_path(d, &"g".repeat(64), EbookFormat::Pdf).is_none());
}

#[test]
fn sweep_removes_unreferenced_and_orphan_temporaries_only() {
    let dir = tempfile::tempdir().unwrap();
    let kept = format!("{}.epub", "a".repeat(64));
    let gone = format!("{}.pdf", "b".repeat(64));
    write(dir.path(), &kept, b"1");
    write(dir.path(), &gone, b"2");
    write(dir.path(), ".tmp-orphan", b"3");
    write(dir.path(), "notes.txt", b"4");
    let referenced: HashSet<String> = ["a".repeat(64)].into();
    // Too recent: nothing goes.
    assert_eq!(
        sweep_staged(dir.path(), &referenced, Duration::from_secs(3600)).unwrap(),
        0
    );
    assert_eq!(
        sweep_staged(dir.path(), &referenced, Duration::ZERO).unwrap(),
        2
    );
    assert_eq!(names(dir.path()), vec![kept, "notes.txt".to_string()]);
}

#[tokio::test]
async fn same_bytes_other_extension_is_not_stored_twice() {
    let dir = tempfile::tempdir().unwrap();
    let mut data = vec![0u8; 80];
    data[60..68].copy_from_slice(b"BOOKMOBI");
    let body = || axum::body::Body::from(data.clone());
    let a = bookeeper_core::ebooks::store_stream(dir.path(), "a.mobi", body(), 1 << 20)
        .await
        .unwrap();
    let b = bookeeper_core::ebooks::store_stream(dir.path(), "a.azw3", body(), 1 << 20)
        .await
        .unwrap();
    assert_eq!(a.format, b.format);
    assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 1);
}

#[test]
fn large_pdf_metadata_is_read_from_the_tail() {
    let dir = tempfile::tempdir().unwrap();
    let base = pdf(false);
    let nl = base.iter().position(|b| *b == b'\n').unwrap() + 1;
    let mut bytes = base[..nl].to_vec();
    bytes.extend(std::iter::repeat_n(b'%', 9 << 20));
    bytes.push(b'\n');
    bytes.extend(&base[nl..]);
    let p = write(dir.path(), "big.pdf", &bytes);
    let m = read_metadata(&p, EbookFormat::Pdf);
    assert_eq!(m.title.as_deref(), Some("Dune"));
    assert_eq!(m.authors, vec!["Frank Herbert", "Brian Herbert"]);
}

#[test]
fn an_oversized_opf_is_never_handed_to_the_epub_parser() {
    let dir = tempfile::tempdir().unwrap();
    let mut buf = std::io::Cursor::new(Vec::new());
    {
        let mut z = zip::ZipWriter::new(&mut buf);
        let stored = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
        let deflated = SimpleFileOptions::default();
        z.start_file("mimetype", stored).unwrap();
        z.write_all(b"application/epub+zip").unwrap();
        z.start_file("META-INF/container.xml", deflated).unwrap();
        z.write_all(
            br#"<container><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>"#,
        )
        .unwrap();
        // Highly compressible: tiny on disk, 40 MB once inflated.
        z.start_file("OEBPS/content.opf", deflated).unwrap();
        z.write_all(b"<package><metadata><dc:title>Bomba</dc:title></metadata><!--")
            .unwrap();
        z.write_all(&vec![b' '; 40 << 20]).unwrap();
        z.write_all(b"--></package>").unwrap();
        z.finish().unwrap();
    }
    let bytes = buf.into_inner();
    assert!(bytes.len() < 1 << 20);
    let p = write(dir.path(), "bomb.epub", &bytes);
    assert_eq!(read_metadata(&p, EbookFormat::Epub), Default::default());
    assert_eq!(extract_cover(&p, EbookFormat::Epub), None);
}

fn big_pdf_with_tail(tail: &str) -> Vec<u8> {
    let mut bytes = b"%PDF-1.4\n".to_vec();
    bytes.extend(std::iter::repeat_n(b'%', 9 << 20));
    bytes.push(b'\n');
    bytes.extend(tail.as_bytes());
    bytes
}

#[test]
fn large_pdf_tail_does_not_mistake_a_longer_object_number() {
    let dir = tempfile::tempdir().unwrap();
    let bytes = big_pdf_with_tail(
        "11 0 obj\n<< /Title (Capitolo 3) /Parent 10 0 R >>\nendobj\n\
         trailer\n<< /Root 2 0 R /Info 1 0 R /Size 12 >>\nstartxref\n0\n%%EOF\n",
    );
    let p = write(dir.path(), "big.pdf", &bytes);
    assert_eq!(read_metadata(&p, EbookFormat::Pdf).title, None);

    let bytes = big_pdf_with_tail(
        "1 0 obj\n<< /Title (Vero) >>\nendobj\n\
         11 0 obj\n<< /Title (Capitolo 3) >>\nendobj\n\
         trailer\n<< /Root 2 0 R /Info 1 0 R /Size 12 >>\nstartxref\n0\n%%EOF\n",
    );
    let p = write(dir.path(), "big2.pdf", &bytes);
    assert_eq!(
        read_metadata(&p, EbookFormat::Pdf).title.as_deref(),
        Some("Vero")
    );
}

#[test]
fn large_pdf_tail_decodes_octal_escapes() {
    let dir = tempfile::tempdir().unwrap();
    let bytes = big_pdf_with_tail(
        "3 0 obj\n<< /Title (Caf\\351 \\(bis\\)) /Author (A\\\nB) >>\nendobj\n\
         trailer\n<< /Root 2 0 R /Info 3 0 R /Size 4 >>\nstartxref\n0\n%%EOF\n",
    );
    let p = write(dir.path(), "big.pdf", &bytes);
    let m = read_metadata(&p, EbookFormat::Pdf);
    assert_eq!(m.title.as_deref(), Some("Café (bis)"));
    assert_eq!(m.authors, vec!["AB"]);
}
