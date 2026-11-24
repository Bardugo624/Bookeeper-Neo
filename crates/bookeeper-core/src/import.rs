//! Library import: parsers for Goodreads, Calibre and LibraryThing exports.
//!
//! The parsers only turn text into [`ParsedRow`]s; validation, duplicate detection and
//! writing belong to `api::transfer`.
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::{
    api::util::{normalize_isbn10, normalize_isbn13},
    error::{ApiError, ApiResult},
};

/// Most data rows accepted in one import.
pub const MAX_ROWS: usize = 20_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "lowercase")]
pub enum RequestFormat {
    Auto,
    Goodreads,
    Calibre,
    Librarything,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Format {
    Goodreads,
    Calibre,
    LibraryThing,
}

impl Format {
    pub fn as_str(self) -> &'static str {
        match self {
            Format::Goodreads => "goodreads",
            Format::Calibre => "calibre",
            Format::LibraryThing => "librarything",
        }
    }

    fn delimiter(self) -> u8 {
        match self {
            Format::LibraryThing => b'\t',
            _ => b',',
        }
    }
}

/// A normalized record read from an import file.
#[derive(Debug, Clone, Default, PartialEq, Serialize, ToSchema)]
pub struct ImportedBook {
    pub title: String,
    pub authors: Vec<String>,
    pub isbn_13: Option<String>,
    pub isbn_10: Option<String>,
    pub publisher: Option<String>,
    pub published_year: Option<i64>,
    pub page_count: Option<i64>,
    pub language: Option<String>,
    /// `hardcover`, `paperback`, `ebook` or `audiobook`.
    pub format: Option<String>,
    pub notes: Option<String>,
}

/// A parsed data row; `row` is the line of the file where the record starts.
#[derive(Debug, Clone, PartialEq)]
pub struct ParsedRow {
    pub row: u64,
    pub book: ImportedBook,
}

fn strip_bom(content: &str) -> &str {
    content.strip_prefix('\u{feff}').unwrap_or(content)
}

fn norm_header(h: &str) -> String {
    let h = h.trim().trim_matches(|c| c == '\'' || c == '"');
    h.split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}

fn reader(content: &str, delimiter: u8) -> csv::Reader<&[u8]> {
    csv::ReaderBuilder::new()
        .delimiter(delimiter)
        .has_headers(false)
        .flexible(true)
        .from_reader(content.as_bytes())
}

fn header_of(content: &str, delimiter: u8) -> Vec<String> {
    let mut rd = reader(content, delimiter);
    let mut rec = csv::StringRecord::new();
    match rd.read_record(&mut rec) {
        Ok(true) => rec.iter().map(norm_header).collect(),
        _ => Vec::new(),
    }
}

/// Recognizes the format from the header row.
pub fn detect(content: &str) -> Option<Format> {
    let content = strip_bom(content);
    let tab = header_of(content, b'\t');
    if tab.iter().any(|h| h == "primary author") && tab.iter().any(|h| h == "title") {
        return Some(Format::LibraryThing);
    }
    let comma = header_of(content, b',');
    let has = |name: &str| comma.iter().any(|h| h == name);
    if has("title") && has("author") && (has("isbn13") || has("exclusive shelf") || has("book id"))
    {
        return Some(Format::Goodreads);
    }
    if has("title") && has("authors") {
        return Some(Format::Calibre);
    }
    None
}

/// Strips Goodreads' `="..."` wrapper, quotes and brackets.
fn unwrap_isbn(token: &str) -> &str {
    token
        .trim()
        .trim_start_matches('=')
        .trim_matches(|c: char| c == '"' || c == '\'' || c == '[' || c == ']' || c.is_whitespace())
}

/// Picks the first valid ISBN-13 and ISBN-10 among the tokens of the given cells.
/// Invalid tokens are dropped.
fn isbns(cells: &[&str]) -> (Option<String>, Option<String>) {
    let mut i13 = None;
    let mut i10 = None;
    for cell in cells {
        for token in cell.split([',', ';']) {
            let t = unwrap_isbn(token);
            if t.is_empty() {
                continue;
            }
            if i13.is_none() {
                if let Some(v) = normalize_isbn13(t) {
                    i13 = Some(v);
                    continue;
                }
            }
            if i10.is_none() {
                if let Some(v) = normalize_isbn10(t) {
                    i10 = Some(v);
                }
            }
        }
    }
    (i13, i10)
}

fn opt(s: &str) -> Option<String> {
    let s = s.trim();
    (!s.is_empty()).then(|| s.to_string())
}

/// Parses a positive integer; zero, negatives and garbage give `None`.
fn positive(s: &str) -> Option<i64> {
    s.trim().parse::<i64>().ok().filter(|n| *n > 0)
}

/// Same table as the Go `mapBinding`.
pub fn map_binding(binding: &str) -> Option<String> {
    let f = match binding.trim().to_lowercase().as_str() {
        "hardcover" | "hardback" | "copertina rigida" => "hardcover",
        "paperback"
        | "mass market paperback"
        | "softcover"
        | "copertina flessibile"
        | "brossura" => "paperback",
        "ebook" | "kindle edition" | "epub" => "ebook",
        "audiobook" | "audible audio" | "audio cd" => "audiobook",
        _ => return None,
    };
    Some(f.to_string())
}

struct Row<'a> {
    idx: &'a std::collections::HashMap<String, usize>,
    rec: &'a csv::StringRecord,
}

impl Row<'_> {
    fn get(&self, col: &str) -> &str {
        self.idx
            .get(col)
            .and_then(|i| self.rec.get(*i))
            .map_or("", str::trim)
    }
}

fn goodreads(r: &Row) -> ImportedBook {
    let mut authors = Vec::new();
    if let Some(a) = opt(r.get("author")) {
        authors.push(a);
    }
    authors.extend(r.get("additional authors").split(',').filter_map(opt));
    let (i13, i10) = isbns(&[r.get("isbn13"), r.get("isbn")]);
    let year =
        positive(r.get("year published")).or_else(|| positive(r.get("original publication year")));
    let mut notes = r.get("private notes").to_string();
    let review = r.get("my review");
    if !review.is_empty() {
        if !notes.is_empty() {
            notes.push_str("\n\n");
        }
        notes.push_str(review);
    }
    ImportedBook {
        title: r.get("title").to_string(),
        authors,
        isbn_13: i13,
        isbn_10: i10,
        publisher: opt(r.get("publisher")),
        published_year: year,
        page_count: positive(r.get("number of pages")),
        language: None,
        format: map_binding(r.get("binding")),
        notes: opt(&notes),
    }
}

fn calibre(r: &Row) -> ImportedBook {
    let authors = r.get("authors").split('&').filter_map(opt).collect();
    let (i13, i10) = isbns(&[r.get("isbn")]);
    let year = r
        .get("pubdate")
        .get(..4)
        .and_then(|y| y.parse::<i64>().ok())
        .filter(|y| *y > 0);
    let language = r.get("languages").split([',', ';']).next().and_then(opt);
    ImportedBook {
        title: r.get("title").to_string(),
        authors,
        isbn_13: i13,
        isbn_10: i10,
        publisher: opt(r.get("publisher")),
        published_year: year,
        page_count: None,
        language,
        format: None,
        notes: None,
    }
}

fn librarything(r: &Row) -> ImportedBook {
    let mut authors = Vec::new();
    if let Some(a) = opt(r.get("primary author")).or_else(|| opt(r.get("author (first, last)"))) {
        authors.push(a);
    }
    if let Some(a) = opt(r.get("secondary author")) {
        authors.push(a);
    }
    let (i13, i10) = isbns(&[r.get("isbns"), r.get("isbn")]);
    // `DATE` is a bare year or a full date; take the first four digits.
    let year = r
        .get("date")
        .get(..4)
        .and_then(|y| y.parse::<i64>().ok())
        .filter(|y| *y > 0);
    let language = r.get("languages").split([',', ';']).next().and_then(opt);
    ImportedBook {
        title: r.get("title").to_string(),
        authors,
        isbn_13: i13,
        isbn_10: i10,
        publisher: opt(r.get("publication")),
        published_year: year,
        page_count: positive(r.get("page count")),
        language,
        format: None,
        notes: None,
    }
}

/// Parses `content` as `format`. More than [`MAX_ROWS`] data rows or a missing `title`
/// column give 422 `validation`. Rows that are entirely empty are skipped.
pub fn parse(format: Format, content: &str) -> ApiResult<Vec<ParsedRow>> {
    let content = strip_bom(content);
    let mut rd = reader(content, format.delimiter());
    let mut records = rd.records();
    let header = match records.next() {
        Some(Ok(h)) => h,
        _ => return Err(ApiError::validation("The file is empty")),
    };
    let mut idx = std::collections::HashMap::new();
    for (i, h) in header.iter().enumerate() {
        idx.entry(norm_header(h)).or_insert(i);
    }
    if !idx.contains_key("title") {
        return Err(ApiError::validation("The file has no title column"));
    }
    let mut rows = Vec::new();
    for rec in records {
        // An unreadable record (e.g. invalid UTF-8) becomes a row without a title,
        // which is reported as invalid.
        let (line, rec, broken) = match rec {
            Ok(r) => (r.position().map_or(0, csv::Position::line), r, false),
            Err(e) => (
                e.position().map_or(0, csv::Position::line),
                csv::StringRecord::new(),
                true,
            ),
        };
        if !broken && rec.iter().all(|f| f.trim().is_empty()) {
            continue;
        }
        if rows.len() >= MAX_ROWS {
            return Err(ApiError::validation(format!(
                "The file has more than {MAX_ROWS} rows"
            )));
        }
        let row = Row {
            idx: &idx,
            rec: &rec,
        };
        let book = match format {
            Format::Goodreads => goodreads(&row),
            Format::Calibre => calibre(&row),
            Format::LibraryThing => librarything(&row),
        };
        rows.push(ParsedRow { row: line, book });
    }
    Ok(rows)
}
