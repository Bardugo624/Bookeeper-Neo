use bookeeper_desktop_lib::updates::{
    error_code, is_update, manifest_url, plan, Channel, Plan, Stage, UpdateState, DEFAULT_BASE,
};
use semver::Version;
use tauri_plugin_updater::Error;

fn v(s: &str) -> Version {
    Version::parse(s).unwrap()
}

#[test]
fn address_follows_the_channel() {
    assert_eq!(
        manifest_url(DEFAULT_BASE, Channel::Stable),
        "https://updates.neokeeper.dev/v2/stable/latest.json"
    );
    assert_eq!(
        manifest_url(DEFAULT_BASE, Channel::Beta),
        "https://updates.neokeeper.dev/v2/beta/latest.json"
    );
}

#[test]
fn address_follows_a_custom_base() {
    assert_eq!(
        manifest_url("https://example.org/u/", Channel::Beta),
        "https://example.org/u/beta/latest.json"
    );
    assert_eq!(
        manifest_url("https://example.org/u", Channel::Stable),
        "https://example.org/u/stable/latest.json"
    );
}

#[test]
fn without_a_key_nothing_is_requested() {
    assert_eq!(plan(None, DEFAULT_BASE, "stable"), Ok(Plan::Disabled));
    assert_eq!(plan(Some("  "), DEFAULT_BASE, "beta"), Ok(Plan::Disabled));
}

#[test]
fn with_a_key_the_plan_names_the_address() {
    assert_eq!(
        plan(Some("KEY"), "https://example.org/u", "beta"),
        Ok(Plan::Check {
            url: "https://example.org/u/beta/latest.json".into(),
            channel: Channel::Beta
        })
    );
}

#[test]
fn an_unknown_channel_is_an_error_even_without_a_key() {
    assert!(plan(Some("KEY"), DEFAULT_BASE, "nightly").is_err());
    assert!(plan(None, DEFAULT_BASE, "").is_err());
    assert!(plan(Some("KEY"), DEFAULT_BASE, "Stable").is_err());
}

#[test]
fn version_comparison() {
    use Channel::{Beta, Stable};
    // (current, remote, channel, offered)
    let cases = [
        ("2.0.0", "2.0.1", Stable, true),
        ("2.0.0", "2.0.0", Stable, false),
        ("2.0.1", "2.0.0", Stable, false),
        ("2.0.0", "2.1.0-beta.1", Stable, false),
        ("2.1.0-beta.2", "2.1.0", Stable, true),
        ("2.1.0-beta.2", "2.2.0", Stable, true),
        ("2.1.0-beta.2", "2.0.9", Stable, false),
        ("2.1.0-beta.2", "2.1.0-beta.3", Stable, false),
        ("2.0.0", "2.1.0-beta.1", Beta, true),
        ("2.1.0-beta.1", "2.1.0-beta.2", Beta, true),
        ("2.1.0-beta.2", "2.1.0-beta.2", Beta, false),
        ("2.1.0-beta.2", "2.1.0-beta.1", Beta, false),
        ("2.1.0-beta.2", "2.1.0", Beta, true),
        ("2.1.0-beta.10", "2.1.0-beta.9", Beta, false),
        ("2.1.0", "2.1.0-beta.5", Beta, false),
    ];
    for (current, remote, channel, want) in cases {
        assert_eq!(
            is_update(&v(current), &v(remote), channel),
            want,
            "{current} -> {remote} on {channel:?}"
        );
    }
}

#[test]
fn errors_map_to_codes() {
    let json = serde_json::from_str::<serde_json::Value>("{").unwrap_err();
    let cases: Vec<(Error, Stage, &str)> = vec![
        (Error::Network("down".into()), Stage::Check, "network"),
        (Error::Network("cut".into()), Stage::Install, "network"),
        (
            Error::SignatureUtf8("x".into()),
            Stage::Install,
            "signature",
        ),
        (
            Error::SignedVersionMismatch {
                signed: "1.0.0".into(),
                announced: "2.0.0".into(),
            },
            Stage::Install,
            "signature",
        ),
        (Error::MissingSignedVersion, Stage::Install, "signature"),
        (Error::ReleaseNotFound, Stage::Check, "manifest"),
        (
            Error::TargetNotFound("linux-x86_64".into()),
            Stage::Check,
            "manifest",
        ),
        (Error::Serialization(json), Stage::Check, "manifest"),
        (Error::DebInstallFailed, Stage::Install, "install"),
        (Error::TempDirNotFound, Stage::Install, "install"),
        (Error::DebInstallFailed, Stage::Check, "manifest"),
    ];
    for (err, stage, want) in cases {
        assert_eq!(error_code(&err, stage), want, "{err}");
    }
}

#[test]
fn states_serialise_with_a_tag() {
    let s = serde_json::to_value(UpdateState::Available {
        version: "2.1.0".into(),
        notes: "n".into(),
        date: None,
    })
    .unwrap();
    assert_eq!(
        s,
        serde_json::json!({ "state": "available", "version": "2.1.0", "notes": "n", "date": null })
    );
    assert_eq!(
        serde_json::to_value(UpdateState::Disabled).unwrap(),
        serde_json::json!({ "state": "disabled" })
    );
    assert_eq!(
        serde_json::to_value(UpdateState::Error {
            code: "signature".into()
        })
        .unwrap(),
        serde_json::json!({ "state": "error", "code": "signature" })
    );
}
