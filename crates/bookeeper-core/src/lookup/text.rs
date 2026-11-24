//! Text helpers shared by the providers: HTML stripping, entity decoding, bounded body reads.

/// Plain text from an HTML fragment: tags removed, line breaks on block tags, entities decoded.
///
/// A `<` opens a tag only when followed by an ASCII letter, `/` or `!`; a lone `<` or a
/// tag that never closes stays as text.
pub fn strip_html(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    while let Some(i) = rest.find('<') {
        out.push_str(&rest[..i]);
        let after = &rest[i + 1..];
        let opens_tag = after
            .chars()
            .next()
            .is_some_and(|c| c.is_ascii_alphabetic() || c == '/' || c == '!');
        let end = if opens_tag { after.find('>') } else { None };
        match end {
            Some(e) => {
                let name: String = after[..e]
                    .trim_start_matches('/')
                    .chars()
                    .take_while(char::is_ascii_alphanumeric)
                    .collect::<String>()
                    .to_ascii_lowercase();
                if matches!(name.as_str(), "br" | "p" | "div" | "li" | "ul" | "ol")
                    && !out.is_empty()
                    && !out.ends_with('\n')
                {
                    out.push('\n');
                }
                rest = &after[e + 1..];
            }
            None => {
                out.push('<');
                rest = after;
            }
        }
    }
    out.push_str(rest);
    let decoded = decode_entities(&out);
    decoded.trim_end_matches('\n').to_string()
}

/// Decode numeric (`&#233;`, `&#xE9;`) and common named entities; unknown ones stay as-is.
pub fn decode_entities(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    while let Some(i) = rest.find('&') {
        out.push_str(&rest[..i]);
        rest = &rest[i..];
        let decoded = rest
            .find(';')
            .filter(|&e| e <= 10)
            .and_then(|e| entity(&rest[1..e]).map(|c| (c, e + 1)));
        match decoded {
            Some((c, len)) => {
                out.push(c);
                rest = &rest[len..];
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

fn entity(name: &str) -> Option<char> {
    if let Some(n) = name.strip_prefix('#') {
        let code = match n.strip_prefix(['x', 'X']) {
            Some(h) => u32::from_str_radix(h, 16).ok()?,
            None => n.parse::<u32>().ok()?,
        };
        return char::from_u32(code);
    }
    Some(match name {
        "amp" => '&',
        "lt" => '<',
        "gt" => '>',
        "quot" => '"',
        "apos" => '\'',
        "nbsp" => ' ',
        "hellip" => '…',
        "mdash" => '—',
        "ndash" => '–',
        "lsquo" => '‘',
        "rsquo" => '’',
        "ldquo" => '“',
        "rdquo" => '”',
        "laquo" => '«',
        "raquo" => '»',
        "copy" => '©',
        "reg" => '®',
        "euro" => '€',
        "deg" => '°',
        "szlig" => 'ß',
        "ccedil" => 'ç',
        "Ccedil" => 'Ç',
        "ntilde" => 'ñ',
        "Ntilde" => 'Ñ',
        _ => return accented(name),
    })
}

/// Accented vowels: one vowel followed by grave/acute/circ/uml, any case of the vowel.
fn accented(name: &str) -> Option<char> {
    let first = name.chars().next()?;
    let accent = name.get(1..)?;
    let table: &str = match accent {
        "grave" => "aàeèiìoòuù",
        "acute" => "aáeéiíoóuú",
        "circ" => "aâeêiîoôuû",
        "uml" => "aäeëiïoöuü",
        _ => return None,
    };
    let lower = first.to_ascii_lowercase();
    let mut it = table.chars();
    while let (Some(base), Some(acc)) = (it.next(), it.next()) {
        if base == lower {
            return if first.is_ascii_uppercase() {
                acc.to_uppercase().next()
            } else {
                Some(acc)
            };
        }
    }
    None
}

/// Read a response body in chunks; more than `max` bytes is an error, without reading the rest.
pub async fn read_limited(mut resp: reqwest::Response, max: usize) -> Result<String, String> {
    let mut buf: Vec<u8> = Vec::new();
    while let Some(chunk) = resp.chunk().await.map_err(|e| format!("read body: {e}"))? {
        if buf.len() + chunk.len() > max {
            return Err(format!("body larger than {max} bytes"));
        }
        buf.extend_from_slice(&chunk);
    }
    String::from_utf8(buf).map_err(|_| "body is not valid UTF-8".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lone_less_than_is_text() {
        assert_eq!(strip_html("a < b e c > d"), "a < b e c > d");
    }

    #[test]
    fn paragraphs_become_lines() {
        assert_eq!(strip_html("<p>uno</p><p>due</p>"), "uno\ndue");
        assert_eq!(strip_html("a<br/>b<ul><li>c</li></ul>"), "a\nb\nc");
    }

    #[test]
    fn unclosed_tag_stays_text() {
        assert_eq!(strip_html("ciao <b non chiuso"), "ciao <b non chiuso");
    }

    #[test]
    fn entities() {
        assert_eq!(decode_entities("&egrave;"), "è");
        assert_eq!(decode_entities("&Egrave;&Uuml;&acirc;"), "ÈÜâ");
        assert_eq!(decode_entities("&#233;"), "é");
        assert_eq!(decode_entities("&#xE9;"), "é");
        assert_eq!(decode_entities("&hellip;"), "…");
        assert_eq!(decode_entities("a&nbsp;b"), "a b");
        assert_eq!(decode_entities("&sconosciuta;"), "&sconosciuta;");
        assert_eq!(decode_entities("&szlig;&ntilde;&ccedil;"), "ßñç");
    }
}
