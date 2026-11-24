//! PDF label generation: A4 sheets, 4 × 11 labels of 48 × 25 mm, each with a Data Matrix
//! of the 12-digit label code and three lines of text.
//!
//! The PDF is written by hand (standard Helvetica fonts, no compression, no dates, no ids),
//! so the same labels always produce the same bytes.
use std::fmt::Write as _;

use datamatrix::{DataMatrix, SymbolList};

const MM: f64 = 72.0 / 25.4;
const PAGE_W: f64 = 210.0 * MM;
const PAGE_H: f64 = 297.0 * MM;
const COLS: usize = 4;
const ROWS: usize = 11;
const LABEL_W: f64 = 48.0 * MM;
const LABEL_H: f64 = 25.0 * MM;
const PER_PAGE: usize = COLS * ROWS;
const SYMBOL: f64 = 18.0 * MM; // symbol plus quiet zone
const PAD: f64 = 1.5 * MM;
const TEXT_GAP: f64 = 1.0 * MM;

#[derive(Debug, Clone, PartialEq)]
pub struct Label {
    pub progressive: i64,
    pub title: String,
    pub authors: String,
    pub shelf_name: Option<String>,
    pub shelf_code: i64,
    /// Shelf row, counted from 1; 0 = not placed.
    pub row: i64,
    /// Slot in the row, counted from 1; 0 = not placed.
    pub slot: i64,
}

#[derive(Debug)]
pub struct LabelError(pub String);

impl std::fmt::Display for LabelError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "label generation failed: {}", self.0)
    }
}

impl std::error::Error for LabelError {}

fn placed(l: &Label) -> bool {
    l.shelf_name.is_some() && l.row > 0 && l.slot > 0
}

/// `PPPP XX YY ZZZZ`: progressive, slot, row, shelf code. Always 12 digits; values that do
/// not fit their field wrap modulo 10^n. A book that is not placed has zeros for the last 8.
pub fn label_code(l: &Label) -> String {
    let f = |v: i64, m: i64| v.rem_euclid(m);
    let (slot, row, shelf) = if placed(l) {
        (l.slot, l.row, l.shelf_code)
    } else {
        (0, 0, 0)
    };
    format!(
        "{:04}{:02}{:02}{:04}",
        f(l.progressive, 10_000),
        f(slot, 100),
        f(row, 100),
        f(shelf, 10_000)
    )
}

/// The Data Matrix of `code` as (row-major modules, side). `true` = dark. No quiet zone.
pub fn datamatrix_bitmap(code: &str) -> Result<(Vec<bool>, usize), LabelError> {
    let dm = DataMatrix::encode(code.as_bytes(), SymbolList::default())
        .map_err(|e| LabelError(format!("{e:?}")))?;
    let bm = dm.bitmap();
    Ok((bm.bits().to_vec(), bm.width()))
}

// Helvetica advance widths for 0x20..=0x7E, in 1/1000 em.
const WIDTHS: [u16; 95] = [
    278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278,
    278, // ' '..'/'
    556, 556, 556, 556, 556, 556, 556, 556, 556, 556, // digits
    278, 278, 584, 584, 584, 556, 1015, // ':'..'@'
    667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667,
    611, 722, 667, 944, 667, 667, 611, // A-Z
    278, 278, 278, 469, 556, 333, // '['..'`'
    556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500,
    278, 556, 500, 722, 500, 500, 500, // a-z
    334, 260, 334, 584, // '{'..'~'
];

const ELLIPSIS: u8 = 0x85; // WinAnsi

/// Maps text to WinAnsi bytes: Latin-1 is kept, everything else becomes `?`.
fn encode_text(s: &str) -> Vec<u8> {
    s.chars()
        .map(|c| match c as u32 {
            0x20..=0x7E | 0xA0..=0xFF => c as u32 as u8,
            _ => b'?',
        })
        .collect()
}

/// Width of a WinAnsi letter in `0xC0..=0xFF`: its base letter's, never less than Helvetica's.
fn latin1_letter_width(b: u8) -> u16 {
    let base = match b {
        0xC6 => return 1000,
        0xE6 => return 889,
        0xDF => return 611,
        0xD0 => return 722,
        0xF0 => return 556,
        0xDE => return 667,
        0xFE => return 556,
        0xD7 | 0xF7 => return 584,
        0xC0..=0xC5 => b'A',
        0xC7 => b'C',
        0xC8..=0xCB => b'E',
        0xCC..=0xCF => b'I',
        0xD1 => b'N',
        0xD2..=0xD6 | 0xD8 => b'O',
        0xD9..=0xDC => b'U',
        0xDD => b'Y',
        0xE0..=0xE5 => b'a',
        0xE7 => b'c',
        0xE8..=0xEB => b'e',
        0xEC..=0xEF => b'i',
        0xF1 => b'n',
        0xF2..=0xF6 | 0xF8 => b'o',
        0xF9..=0xFC => b'u',
        0xFD | 0xFF => b'y',
        _ => return 1000,
    };
    WIDTHS[usize::from(base - 0x20)]
}

fn glyph_width(b: u8, bold: bool) -> f64 {
    let w = match b {
        0x20..=0x7E => f64::from(WIDTHS[usize::from(b - 0x20)]),
        ELLIPSIS => 1000.0,
        0x80..=0x9F => 1000.0,
        0xA0..=0xBF => 840.0,
        0xC0..=0xFF => f64::from(latin1_letter_width(b)),
        _ => 600.0,
    };
    if bold {
        w * 1.1
    } else {
        w
    }
}

fn text_width(bytes: &[u8], size: f64, bold: bool) -> f64 {
    bytes.iter().map(|&b| glyph_width(b, bold)).sum::<f64>() * size / 1000.0
}

/// Truncates to `max` points, ending with an ellipsis when something was cut.
fn fit(s: &str, size: f64, bold: bool, max: f64) -> Vec<u8> {
    let bytes = encode_text(s);
    if text_width(&bytes, size, bold) <= max {
        return bytes;
    }
    let ell = text_width(&[ELLIPSIS], size, bold);
    let mut out = Vec::new();
    let mut w = ell;
    for &b in &bytes {
        w += glyph_width(b, bold) * size / 1000.0;
        if w > max {
            break;
        }
        out.push(b);
    }
    while out.last() == Some(&b' ') {
        out.pop();
    }
    out.push(ELLIPSIS);
    out
}

fn pdf_string(bytes: &[u8]) -> String {
    let mut s = String::from("(");
    for &b in bytes {
        match b {
            b'(' | b')' | b'\\' => {
                s.push('\\');
                s.push(b as char);
            }
            0x20..=0x7E => s.push(b as char),
            _ => {
                let _ = write!(s, "\\{b:03o}");
            }
        }
    }
    s.push(')');
    s
}

fn n(v: f64) -> String {
    let s = format!("{v:.2}");
    let s = s.trim_end_matches('0').trim_end_matches('.');
    if s.is_empty() || s == "-" {
        "0".into()
    } else {
        s.to_string()
    }
}

fn draw_label(out: &mut String, l: &Label, x: f64, top: f64) -> Result<(), LabelError> {
    // Data Matrix: dark modules, runs merged into rectangles.
    let (bits, side) = datamatrix_bitmap(&label_code(l))?;
    let module = SYMBOL / (side + 2) as f64; // one module of quiet zone each side
    let sx = x + PAD + module;
    let sy = top - (LABEL_H - SYMBOL) / 2.0 - module; // top edge of the symbol
    out.push_str("0 g\n");
    for r in 0..side {
        let mut c = 0;
        while c < side {
            if !bits[r * side + c] {
                c += 1;
                continue;
            }
            let start = c;
            while c < side && bits[r * side + c] {
                c += 1;
            }
            let _ = writeln!(
                out,
                "{} {} {} {} re f",
                n(sx + start as f64 * module),
                n(sy - (r + 1) as f64 * module),
                n((c - start) as f64 * module),
                n(module)
            );
        }
    }
    // Text.
    let tx = x + PAD + SYMBOL + TEXT_GAP;
    let max = x + LABEL_W - PAD - tx;
    let third = if placed(l) {
        format!(
            "{} \u{b7} M{} \u{b7} P{}",
            l.shelf_name.as_deref().unwrap_or(""),
            l.row,
            l.slot
        )
    } else {
        "non collocato".to_string()
    };
    let lines: [(&str, &str, f64, bool); 3] = [
        ("F2", &format!("N. {}", l.progressive), 9.0, true),
        ("F1", &l.title, 7.5, false),
        ("F1", &third, 6.5, false),
    ];
    let mut y = top - 7.0 * MM;
    for (font, text, size, bold) in lines {
        let bytes = fit(text, size, bold, max);
        let _ = writeln!(
            out,
            "BT /{font} {} Tf {} {} Td {} Tj ET",
            n(size),
            n(tx),
            n(y),
            pdf_string(&bytes)
        );
        y -= 5.5 * MM;
    }
    Ok(())
}

/// Renders the labels, 44 per A4 page. An empty slice gives one blank page.
pub fn render_pdf(labels: &[Label]) -> Result<Vec<u8>, LabelError> {
    let pages: Vec<&[Label]> = if labels.is_empty() {
        vec![&[]]
    } else {
        labels.chunks(PER_PAGE).collect()
    };
    let mx = (PAGE_W - COLS as f64 * LABEL_W) / 2.0;
    let my = (PAGE_H - ROWS as f64 * LABEL_H) / 2.0;

    let mut contents = Vec::with_capacity(pages.len());
    for page in &pages {
        let mut s = String::new();
        for (i, l) in page.iter().enumerate() {
            let (c, r) = (i % COLS, i / COLS);
            let x = mx + c as f64 * LABEL_W;
            let top = PAGE_H - my - r as f64 * LABEL_H;
            draw_label(&mut s, l, x, top)?;
        }
        contents.push(s);
    }

    // Objects: 1 catalog, 2 pages, 3 F1, 4 F2, then (page, content) pairs.
    let mut out: Vec<u8> = b"%PDF-1.4\n%\xE2\xE3\xCF\xD3\n".to_vec();
    let mut offsets: Vec<usize> = Vec::new();
    let mut obj = |out: &mut Vec<u8>, body: &[u8]| {
        offsets.push(out.len());
        out.extend_from_slice(format!("{} 0 obj\n", offsets.len()).as_bytes());
        out.extend_from_slice(body);
        out.extend_from_slice(b"\nendobj\n");
    };
    obj(&mut out, b"<< /Type /Catalog /Pages 2 0 R >>");
    let kids: Vec<String> = (0..pages.len())
        .map(|i| format!("{} 0 R", 5 + 2 * i))
        .collect();
    obj(
        &mut out,
        format!(
            "<< /Type /Pages /Kids [{}] /Count {} >>",
            kids.join(" "),
            pages.len()
        )
        .as_bytes(),
    );
    for base in ["Helvetica", "Helvetica-Bold"] {
        obj(
            &mut out,
            format!(
                "<< /Type /Font /Subtype /Type1 /BaseFont /{base} /Encoding /WinAnsiEncoding >>"
            )
            .as_bytes(),
        );
    }
    for (i, content) in contents.iter().enumerate() {
        obj(
            &mut out,
            format!(
                "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {} {}] \
                 /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents {} 0 R >>",
                n(PAGE_W),
                n(PAGE_H),
                6 + 2 * i
            )
            .as_bytes(),
        );
        let mut body = format!("<< /Length {} >>\nstream\n", content.len()).into_bytes();
        body.extend_from_slice(content.as_bytes());
        body.extend_from_slice(b"endstream");
        obj(&mut out, &body);
    }
    let xref = out.len();
    out.extend_from_slice(format!("xref\n0 {}\n", offsets.len() + 1).as_bytes());
    out.extend_from_slice(b"0000000000 65535 f \n");
    for off in &offsets {
        out.extend_from_slice(format!("{off:010} 00000 n \n").as_bytes());
    }
    out.extend_from_slice(
        format!(
            "trailer\n<< /Size {} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n",
            offsets.len() + 1
        )
        .as_bytes(),
    );
    Ok(out)
}

#[cfg(test)]
mod width_tests {
    use super::*;

    fn w(s: &str, bold: bool) -> f64 {
        text_width(&encode_text(s), 10.0, bold)
    }

    #[test]
    fn accented_letters_are_as_wide_as_their_base() {
        for bold in [false, true] {
            assert_eq!(w("ÈÀÒ", bold), w("EAO", bold));
            assert_eq!(w("èàò", bold), w("eao", bold));
        }
    }

    #[test]
    fn symbols_are_never_underestimated() {
        for c in ["©", "®", "¼"] {
            assert!(w(c, false) * 100.0 >= 834.0, "{c}");
        }
        assert!(w("Æ", false) * 100.0 >= 1000.0);
    }

    #[test]
    fn a_title_of_wide_accented_capitals_fits_its_box() {
        let title = "Ò".repeat(40);
        let out = fit(&title, 10.0, false, 100.0);
        assert!(text_width(&out, 10.0, false) <= 100.0);
        assert_eq!(out.last(), Some(&ELLIPSIS));
    }
}
