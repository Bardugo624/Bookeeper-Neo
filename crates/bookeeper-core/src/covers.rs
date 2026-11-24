//! Cover processing, storage helpers and guarded download.
use std::io::Cursor;
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr, ToSocketAddrs};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use image::codecs::jpeg::JpegEncoder;
use image::imageops::FilterType;
use image::{DynamicImage, ImageFormat, ImageReader, Limits, Rgb, RgbImage};

use crate::state::AppState;

/// Largest accepted image, uploaded or downloaded.
pub const MAX_BYTES: usize = 5 * 1024 * 1024;
const MIN_SIDE: u32 = 80;
const MAX_SIDE: u32 = 12_000;
const MAX_PIXELS: u64 = 40_000_000;
const OUT_SIDE: u32 = 1_200;
const JPEG_QUALITY: u8 = 85;
const FETCH_TIMEOUT: Duration = Duration::from_secs(10);
const MAX_REDIRECTS: usize = 3;

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[error("{0}")]
pub struct CoverError(pub String);

/// A cover ready to be stored.
pub struct Processed {
    pub jpeg: Vec<u8>,
    /// `#rrggbb`
    pub color: String,
}

fn err<T>(msg: &str) -> Result<T, CoverError> {
    Err(CoverError(msg.to_string()))
}

/// Decodes JPEG, PNG or WebP (recognised from the bytes), rejects anything else and
/// images below 80x80 or above 12,000 px per side, scales down to 1,200 px on the
/// long side and re-encodes as JPEG quality 85. The original metadata is dropped.
pub fn process(bytes: &[u8]) -> Result<Processed, CoverError> {
    let format = match image::guess_format(bytes) {
        Ok(f @ (ImageFormat::Jpeg | ImageFormat::Png | ImageFormat::WebP)) => f,
        _ => return err("not a JPEG, PNG or WebP image"),
    };
    // Lenient JPEG decoders paper over a cut file with grey; a complete one ends with EOI.
    if format == ImageFormat::Jpeg {
        // Data may legitimately follow the EOI (motion photos, vendor trailers).
        if !bytes.windows(2).any(|w| w == [0xff, 0xd9]) {
            return err("truncated JPEG");
        }
    }
    // Declared dimensions first: nothing is allocated for a hostile header.
    let reader = ImageReader::with_format(Cursor::new(bytes), format);
    let (w, h) = reader
        .into_dimensions()
        .map_err(|_| CoverError("unreadable image".into()))?;
    if w < MIN_SIDE || h < MIN_SIDE {
        return err("image is smaller than 80x80");
    }
    if w > MAX_SIDE || h > MAX_SIDE || u64::from(w) * u64::from(h) > MAX_PIXELS {
        return err("image is too large");
    }
    let mut reader = ImageReader::with_format(Cursor::new(bytes), format);
    let mut limits = Limits::default();
    limits.max_image_width = Some(MAX_SIDE);
    limits.max_image_height = Some(MAX_SIDE);
    limits.max_alloc = Some(512 * 1024 * 1024);
    reader.limits(limits);
    let img = reader
        .decode()
        .map_err(|_| CoverError("corrupt or truncated image".into()))?;
    let rgb = flatten(&img);
    let rgb = if rgb.width().max(rgb.height()) > OUT_SIDE {
        DynamicImage::ImageRgb8(rgb)
            .resize(OUT_SIDE, OUT_SIDE, FilterType::Lanczos3)
            .to_rgb8()
    } else {
        rgb
    };
    let color = dominant_color(&rgb);
    let mut jpeg = Vec::new();
    JpegEncoder::new_with_quality(&mut jpeg, JPEG_QUALITY)
        .encode_image(&rgb)
        .map_err(|_| CoverError("cannot encode image".into()))?;
    Ok(Processed { jpeg, color })
}

/// RGB with transparency composited over white.
fn flatten(img: &DynamicImage) -> RgbImage {
    if !img.color().has_alpha() {
        return img.to_rgb8();
    }
    let rgba = img.to_rgba8();
    let mut out = RgbImage::new(rgba.width(), rgba.height());
    for (x, y, p) in rgba.enumerate_pixels() {
        let a = u32::from(p[3]);
        let mix = |c: u8| ((u32::from(c) * a + 255 * (255 - a) + 127) / 255) as u8;
        out.put_pixel(x, y, Rgb([mix(p[0]), mix(p[1]), mix(p[2])]));
    }
    out
}

fn dominant_color(img: &RgbImage) -> String {
    let small = image::imageops::resize(img, 32, 32, FilterType::Triangle);
    let all: Vec<[u8; 3]> = small.pixels().map(|p| p.0).collect();
    let kept: Vec<[u8; 3]> = all
        .iter()
        .copied()
        .filter(|p| {
            let near_white = p.iter().all(|&c| c >= 235);
            let near_black = p.iter().all(|&c| c <= 20);
            !near_white && !near_black
        })
        .collect();
    let used = if kept.len() * 10 >= all.len() {
        kept
    } else {
        all
    };
    let n = used.len().max(1) as u64;
    let mut sum = [0u64; 3];
    for p in &used {
        for i in 0..3 {
            sum[i] += u64::from(p[i]);
        }
    }
    format!(
        "#{:02x}{:02x}{:02x}",
        (sum[0] / n) as u8,
        (sum[1] / n) as u8,
        (sum[2] / n) as u8
    )
}

/// Path of a book's cover. `None` when the id is not a plain generated identifier.
pub fn cover_path(dir: &Path, book_id: &str) -> Option<PathBuf> {
    let ok = !book_id.is_empty()
        && book_id.len() <= 64
        && book_id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-');
    ok.then(|| dir.join(format!("{book_id}.jpg")))
}

/// Writes the bytes to a temporary file in the same folder, then renames it over the target.
pub fn write_atomic(dir: &Path, book_id: &str, jpeg: &[u8]) -> std::io::Result<()> {
    let target = cover_path(dir, book_id)
        .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::InvalidInput, "bad id"))?;
    let tmp = dir.join(format!(".tmp-{}", uuid::Uuid::now_v7()));
    let res = std::fs::write(&tmp, jpeg).and_then(|()| std::fs::rename(&tmp, &target));
    if res.is_err() {
        let _ = std::fs::remove_file(&tmp);
    }
    res
}

/// Removes the covers of the given books; failures are only logged.
pub fn remove_files(dir: &Path, book_ids: &[String]) {
    for id in book_ids {
        let Some(path) = cover_path(dir, id) else {
            continue;
        };
        if let Err(e) = std::fs::remove_file(&path) {
            if e.kind() != std::io::ErrorKind::NotFound {
                tracing::warn!(error = %e, "cannot delete cover file");
            }
        }
    }
}

// ---------------------------------------------------------------- guarded download

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[error("{0}")]
pub struct FetchError(pub String);

fn ferr<T>(msg: impl Into<String>) -> Result<T, FetchError> {
    Err(FetchError(msg.into()))
}

/// True for addresses a user-supplied URL must never reach.
pub fn is_forbidden_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => forbidden_v4(v4),
        IpAddr::V6(v6) => forbidden_v6(v6),
    }
}

fn forbidden_v4(ip: Ipv4Addr) -> bool {
    let o = ip.octets();
    ip.is_private()
        || ip.is_loopback()
        || ip.is_link_local()
        || ip.is_multicast()
        || ip.is_unspecified()
        || ip.is_broadcast()
        || o[0] == 0
        || (o[0] == 100 && (64..128).contains(&o[1]))
}

fn forbidden_v6(ip: Ipv6Addr) -> bool {
    if let Some(v4) = ip.to_ipv4_mapped() {
        return forbidden_v4(v4);
    }
    let s = ip.segments();
    // 64:ff9b::/96 (NAT64) and ::/96 (IPv4-compatible) embed an IPv4 address.
    if (s[0] == 0x64 && s[1] == 0xff9b && s[2..6] == [0, 0, 0, 0]) || s[..6] == [0; 6] {
        let v4 = Ipv4Addr::new((s[6] >> 8) as u8, s[6] as u8, (s[7] >> 8) as u8, s[7] as u8);
        if forbidden_v4(v4) {
            return true;
        }
    }
    ip.is_loopback()
        || ip.is_unspecified()
        || ip.is_multicast()
        || (s[0] & 0xfe00) == 0xfc00
        || (s[0] & 0xffc0) == 0xfe80
}

enum Host {
    Ip(IpAddr),
    Domain(String),
}

fn host_kind(url: &reqwest::Url) -> Result<Host, FetchError> {
    let h = url
        .host_str()
        .ok_or_else(|| FetchError("URL has no host".into()))?;
    let bare = h.trim_start_matches('[').trim_end_matches(']');
    Ok(match bare.parse::<IpAddr>() {
        Ok(ip) => Host::Ip(ip),
        Err(_) => Host::Domain(h.to_string()),
    })
}

/// Syntactic checks on a URL: scheme, port, credentials, and IP literals.
/// With `allow_private` (tests only) `http://`, any port and private literals pass.
pub fn check_url(url: &reqwest::Url, allow_private: bool) -> Result<(), FetchError> {
    match url.scheme() {
        "https" => {}
        "http" if allow_private => {}
        _ => return ferr("only https URLs are allowed"),
    }
    if !url.username().is_empty() || url.password().is_some() {
        return ferr("credentials in the URL are not allowed");
    }
    if !allow_private && url.port_or_known_default() != Some(443) {
        return ferr("only port 443 is allowed");
    }
    match host_kind(url)? {
        Host::Ip(ip) if !allow_private && is_forbidden_ip(ip) => ferr("address not allowed"),
        _ => Ok(()),
    }
}

/// Resolves a `Location` against the current URL and applies [`check_url`] again.
pub fn redirect_target(
    base: &reqwest::Url,
    location: &str,
    allow_private: bool,
) -> Result<reqwest::Url, FetchError> {
    let next = base
        .join(location)
        .map_err(|_| FetchError("bad redirect".into()))?;
    check_url(&next, allow_private)?;
    Ok(next)
}

/// Resolves the host; every address must be allowed. Returns the one to connect to.
async fn pinned_addr(url: &reqwest::Url, allow_private: bool) -> Result<SocketAddr, FetchError> {
    let port = url.port_or_known_default().unwrap_or(443);
    match host_kind(url)? {
        Host::Ip(ip) => Ok(SocketAddr::new(ip, port)),
        Host::Domain(name) => {
            let addrs: Vec<SocketAddr> = tokio::task::spawn_blocking(move || {
                (name.as_str(), port)
                    .to_socket_addrs()
                    .map(Iterator::collect)
            })
            .await
            .map_err(|_| FetchError("resolution failed".into()))?
            .map_err(|_| FetchError("cannot resolve host".into()))?;
            if addrs.is_empty() {
                return ferr("cannot resolve host");
            }
            if !allow_private && addrs.iter().any(|a| is_forbidden_ip(a.ip())) {
                return ferr("address not allowed");
            }
            Ok(addrs[0])
        }
    }
}

/// Downloads at most 5 MB from a user-supplied URL, with every guard of the contract:
/// https/443 only, no credentials, no private addresses (checked on every resolved
/// address, then the connection is pinned to the checked one), manual redirects (max 3,
/// each re-checked), 10 s overall, size limit enforced while reading.
pub async fn fetch_guarded(state: &AppState, url: &str) -> Result<Vec<u8>, FetchError> {
    let deadline = Instant::now() + FETCH_TIMEOUT;
    match tokio::time::timeout(
        FETCH_TIMEOUT,
        fetch_inner(state.allow_private_fetch, url, deadline),
    )
    .await
    {
        Ok(r) => r,
        Err(_) => ferr("timed out"),
    }
}

async fn fetch_inner(
    allow_private: bool,
    url: &str,
    deadline: Instant,
) -> Result<Vec<u8>, FetchError> {
    let mut current = reqwest::Url::parse(url).map_err(|_| FetchError("invalid URL".into()))?;
    for hop in 0..=MAX_REDIRECTS {
        check_url(&current, allow_private)?;
        let addr = pinned_addr(&current, allow_private).await?;
        let remaining = deadline.saturating_duration_since(Instant::now());
        // A dedicated client per hop: connection pinned to the checked address, no
        // automatic redirects, no proxy (a proxy would resolve the name again).
        let mut builder = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .no_proxy()
            .timeout(remaining)
            .user_agent(format!("Bookeeper/{}", crate::VERSION));
        if let Host::Domain(d) = host_kind(&current)? {
            builder = builder.resolve(&d, addr);
        }
        let client = builder
            .build()
            .map_err(|_| FetchError("cannot build client".into()))?;
        let mut resp = client
            .get(current.clone())
            .send()
            .await
            .map_err(|_| FetchError("request failed".into()))?;
        let status = resp.status();
        if status.is_redirection() {
            if hop == MAX_REDIRECTS {
                return ferr("too many redirects");
            }
            let loc = resp
                .headers()
                .get(reqwest::header::LOCATION)
                .and_then(|v| v.to_str().ok())
                .ok_or_else(|| FetchError("redirect without location".into()))?;
            current = redirect_target(&current, loc, allow_private)?;
            continue;
        }
        if !status.is_success() {
            return ferr(format!("status {status}"));
        }
        if resp.content_length().is_some_and(|n| n > MAX_BYTES as u64) {
            return ferr("response too large");
        }
        let mut body = Vec::new();
        while let Some(chunk) = resp
            .chunk()
            .await
            .map_err(|_| FetchError("read failed".into()))?
        {
            if body.len() + chunk.len() > MAX_BYTES {
                return ferr("response too large");
            }
            body.extend_from_slice(&chunk);
        }
        return Ok(body);
    }
    ferr("too many redirects")
}
