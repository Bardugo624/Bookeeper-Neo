//! TLS identity (self-signed certificate) and pinned client configuration.

use std::fs;
use std::io::Write;
use std::net::IpAddr;
use std::path::Path;
use std::sync::Arc;

use rcgen::{CertificateParams, DistinguishedName, DnType, KeyPair, SanType};
use rustls::client::danger::{HandshakeSignatureValid, ServerCertVerified, ServerCertVerifier};
use rustls::crypto::{ring, WebPkiSupportedAlgorithms};
use rustls::pki_types::pem::PemObject;
use rustls::pki_types::{CertificateDer, PrivateKeyDer, ServerName, UnixTime};
use rustls::sign::CertifiedKey;
use rustls::{DigitallySignedStruct, SignatureScheme};
use sha2::{Digest, Sha256};

use crate::NetError;

const CERT_FILE: &str = "cert.pem";
const KEY_FILE: &str = "key.pem";

fn tls_err(msg: impl std::fmt::Display) -> NetError {
    NetError::Tls(msg.to_string())
}

/// A self-signed server identity.
#[derive(Debug, Clone)]
pub struct Identity {
    pub cert_pem: String,
    pub key_pem: String,
    /// SHA-256 of the DER-encoded certificate.
    pub fingerprint: [u8; 32],
}

impl Identity {
    /// Loads `<dir>/cert.pem` and `<dir>/key.pem`; `Ok(None)` if neither exists.
    pub fn load(dir: &Path) -> Result<Option<Identity>, NetError> {
        let cert_path = dir.join(CERT_FILE);
        let key_path = dir.join(KEY_FILE);
        match (cert_path.exists(), key_path.exists()) {
            (false, false) => return Ok(None),
            (true, true) => {}
            _ => {
                return Err(tls_err(format!(
                    "incomplete identity in {}: both {CERT_FILE} and {KEY_FILE} are required",
                    dir.display()
                )))
            }
        }
        let read = |p: &Path| {
            fs::read_to_string(p).map_err(|e| tls_err(format!("cannot read {}: {e}", p.display())))
        };
        let cert_pem = read(&cert_path)?;
        let key_pem = read(&key_path)?;
        Self::from_pems(cert_pem, key_pem).map(Some)
    }

    /// Loads the identity in `dir`, or generates and stores a new one.
    ///
    /// An unreadable or inconsistent pair is an error: regenerating would
    /// silently change the fingerprint clients have pinned.
    pub fn load_or_create(dir: &Path, names: &[String]) -> Result<Identity, NetError> {
        if let Some(id) = Self::load(dir)? {
            return Ok(id);
        }
        fs::create_dir_all(dir)?;

        let names: Vec<String> = if names.is_empty() {
            vec!["localhost".to_string()]
        } else {
            names.to_vec()
        };
        let mut params = CertificateParams::default();
        params.subject_alt_names = names
            .iter()
            .map(|n| match n.parse::<IpAddr>() {
                Ok(ip) => Ok(SanType::IpAddress(ip)),
                Err(_) => n
                    .as_str()
                    .try_into()
                    .map(SanType::DnsName)
                    .map_err(|e| tls_err(format!("invalid name {n:?}: {e}"))),
            })
            .collect::<Result<_, _>>()?;
        let mut dn = DistinguishedName::new();
        dn.push(DnType::CommonName, "Bookeeper");
        params.distinguished_name = dn;
        let now = time::OffsetDateTime::now_utc();
        params.not_before = now;
        params.not_after = now + time::Duration::days(3650);

        let key = KeyPair::generate_for(&rcgen::PKCS_ECDSA_P256_SHA256).map_err(tls_err)?;
        let cert = params.self_signed(&key).map_err(tls_err)?;
        let cert_pem = cert.pem();
        let key_pem = key.serialize_pem();

        // Key first: a lone key is reported as incomplete rather than used.
        write_atomic(&dir.join(KEY_FILE), key_pem.as_bytes(), true)?;
        write_atomic(&dir.join(CERT_FILE), cert_pem.as_bytes(), false)?;
        Self::from_pems(cert_pem, key_pem)
    }

    fn from_pems(cert_pem: String, key_pem: String) -> Result<Identity, NetError> {
        let (certs, key) = parse_pems(&cert_pem, &key_pem)?;
        let leaf = certs
            .first()
            .ok_or_else(|| tls_err("no certificate in cert.pem"))?;
        let fingerprint: [u8; 32] = Sha256::digest(leaf.as_ref()).into();
        let signing = ring::sign::any_supported_type(&key)
            .map_err(|e| tls_err(format!("unusable private key: {e}")))?;
        CertifiedKey::new(certs, signing)
            .keys_match()
            .map_err(|e| tls_err(format!("certificate and key do not match: {e}")))?;
        Ok(Identity {
            cert_pem,
            key_pem,
            fingerprint,
        })
    }

    /// Fingerprint as uppercase hex pairs separated by `:`.
    pub fn fingerprint_hex(&self) -> String {
        self.fingerprint
            .iter()
            .map(|b| format!("{b:02X}"))
            .collect::<Vec<_>>()
            .join(":")
    }

    /// Server configuration without client authentication; ALPN `h2`, `http/1.1`.
    pub fn server_config(&self) -> Result<Arc<rustls::ServerConfig>, NetError> {
        let (certs, key) = parse_pems(&self.cert_pem, &self.key_pem)?;
        let mut cfg =
            rustls::ServerConfig::builder_with_provider(Arc::new(ring::default_provider()))
                .with_safe_default_protocol_versions()
                .map_err(tls_err)?
                .with_no_client_auth()
                .with_single_cert(certs, key)
                .map_err(tls_err)?;
        cfg.alpn_protocols = vec![b"h2".to_vec(), b"http/1.1".to_vec()];
        Ok(Arc::new(cfg))
    }
}

fn parse_pems(
    cert_pem: &str,
    key_pem: &str,
) -> Result<(Vec<CertificateDer<'static>>, PrivateKeyDer<'static>), NetError> {
    let certs = CertificateDer::pem_slice_iter(cert_pem.as_bytes())
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| tls_err(format!("invalid certificate PEM: {e}")))?;
    if certs.is_empty() {
        return Err(tls_err("no certificate in PEM"));
    }
    let key = PrivateKeyDer::from_pem_slice(key_pem.as_bytes())
        .map_err(|e| tls_err(format!("invalid private key PEM: {e}")))?;
    Ok((certs, key))
}

/// Writes `data` to a temp file in the same directory, then renames it over `path`.
fn write_atomic(path: &Path, data: &[u8], private: bool) -> Result<(), NetError> {
    let dir = path.parent().unwrap_or_else(|| Path::new("."));
    let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("file");
    let tmp = dir.join(format!(".{name}.{}.tmp", std::process::id()));
    let _ = fs::remove_file(&tmp);
    let mut opts = fs::OpenOptions::new();
    opts.write(true).create_new(true);
    #[cfg(unix)]
    if private {
        use std::os::unix::fs::OpenOptionsExt;
        opts.mode(0o600);
    }
    #[cfg(not(unix))]
    let _ = private;
    let result = (|| {
        let mut f = opts.open(&tmp)?;
        f.write_all(data)?;
        f.sync_all()?;
        fs::rename(&tmp, path)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    result.map_err(NetError::from)
}

/// Client configuration that accepts only the certificate with this SHA-256
/// fingerprint, ignoring name and validity period.
pub fn pinned_client_config(fingerprint: [u8; 32]) -> Arc<rustls::ClientConfig> {
    let provider = Arc::new(ring::default_provider());
    let verifier = Arc::new(PinnedVerifier {
        fingerprint,
        algs: provider.signature_verification_algorithms,
    });
    let cfg = rustls::ClientConfig::builder_with_provider(provider)
        .with_safe_default_protocol_versions()
        .expect("ring provider supports the default protocol versions")
        .dangerous()
        .with_custom_certificate_verifier(verifier)
        .with_no_client_auth();
    Arc::new(cfg)
}

#[derive(Debug)]
struct PinnedVerifier {
    fingerprint: [u8; 32],
    algs: WebPkiSupportedAlgorithms,
}

fn ct_eq(a: &[u8], b: &[u8]) -> bool {
    a.len() == b.len() && a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

impl ServerCertVerifier for PinnedVerifier {
    fn verify_server_cert(
        &self,
        end_entity: &CertificateDer<'_>,
        _intermediates: &[CertificateDer<'_>],
        _server_name: &ServerName<'_>,
        _ocsp_response: &[u8],
        _now: UnixTime,
    ) -> Result<ServerCertVerified, rustls::Error> {
        let actual = Sha256::digest(end_entity.as_ref());
        if ct_eq(actual.as_slice(), &self.fingerprint) {
            Ok(ServerCertVerified::assertion())
        } else {
            Err(rustls::Error::General(
                "certificate fingerprint does not match the pinned one".into(),
            ))
        }
    }

    fn verify_tls12_signature(
        &self,
        message: &[u8],
        cert: &CertificateDer<'_>,
        dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, rustls::Error> {
        rustls::crypto::verify_tls12_signature(message, cert, dss, &self.algs)
    }

    fn verify_tls13_signature(
        &self,
        message: &[u8],
        cert: &CertificateDer<'_>,
        dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, rustls::Error> {
        rustls::crypto::verify_tls13_signature(message, cert, dss, &self.algs)
    }

    fn supported_verify_schemes(&self) -> Vec<SignatureScheme> {
        self.algs.supported_schemes()
    }
}
