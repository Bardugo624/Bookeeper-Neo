//! Version comparison for installed vs. bundled releases.

use semver::Version;
use std::cmp::Ordering;

fn parse(v: &str) -> Option<Version> {
    Version::parse(v.trim().trim_start_matches('v')).ok()
}

/// Orders two semver strings; `None` if either does not parse.
pub fn compare(a: &str, b: &str) -> Option<Ordering> {
    Some(parse(a)?.cmp(&parse(b)?))
}

/// True for versions below 2.0.0 (the old 0.x line). Unparsable → false.
pub fn is_legacy(v: &str) -> bool {
    parse(v).is_some_and(|v| v.major < 2)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compare_orders_betas_and_releases() {
        assert_eq!(compare("2.1.0", "2.2.0"), Some(Ordering::Less));
        assert_eq!(compare("2.2.0", "2.2.0"), Some(Ordering::Equal));
        assert_eq!(compare("2.10.0", "2.9.0"), Some(Ordering::Greater));
        assert_eq!(compare("2.2.0-beta.1", "2.2.0"), Some(Ordering::Less));
        assert_eq!(compare("2.2.0-beta.2", "2.2.0-beta.10"), Some(Ordering::Less));
        assert_eq!(compare("nope", "2.2.0"), None);
    }

    #[test]
    fn legacy_below_two() {
        assert!(is_legacy("0.2.1"));
        assert!(is_legacy("1.9.9"));
        assert!(!is_legacy("2.0.0"));
        assert!(!is_legacy("2.0.0-beta.1"));
        assert!(!is_legacy("garbage"));
    }
}
