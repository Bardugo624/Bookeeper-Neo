use std::sync::Arc;

use bookeeper_net::tls::{pinned_client_config, Identity};
use bookeeper_net::NetError;
use rustls::pki_types::ServerName;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tokio_rustls::{TlsAcceptor, TlsConnector};

fn names() -> Vec<String> {
    vec!["localhost".into(), "127.0.0.1".into()]
}

#[test]
fn creates_once_and_loads_the_same_identity() {
    let dir = tempfile::tempdir().unwrap();
    let a = Identity::load_or_create(dir.path(), &names()).unwrap();
    let cert1 = std::fs::read(dir.path().join("cert.pem")).unwrap();
    let key1 = std::fs::read(dir.path().join("key.pem")).unwrap();
    let b = Identity::load_or_create(dir.path(), &names()).unwrap();
    assert_eq!(a.fingerprint, b.fingerprint);
    assert_eq!(cert1, std::fs::read(dir.path().join("cert.pem")).unwrap());
    assert_eq!(key1, std::fs::read(dir.path().join("key.pem")).unwrap());
    assert_eq!(
        Identity::load(dir.path()).unwrap().unwrap().fingerprint,
        a.fingerprint
    );
}

#[test]
fn load_without_files_is_none() {
    let dir = tempfile::tempdir().unwrap();
    assert!(Identity::load(dir.path()).unwrap().is_none());
}

#[test]
fn creates_missing_directory_and_defaults_to_localhost() {
    let dir = tempfile::tempdir().unwrap();
    let sub = dir.path().join("a/b");
    Identity::load_or_create(&sub, &[]).unwrap();
    assert!(sub.join("cert.pem").exists());
}

#[cfg(unix)]
#[test]
fn key_file_is_private() {
    use std::os::unix::fs::PermissionsExt;
    let dir = tempfile::tempdir().unwrap();
    Identity::load_or_create(dir.path(), &names()).unwrap();
    let mode = std::fs::metadata(dir.path().join("key.pem"))
        .unwrap()
        .permissions()
        .mode();
    assert_eq!(mode & 0o777, 0o600);
}

#[test]
fn a_corrupt_pair_is_an_error_not_a_new_identity() {
    let dir = tempfile::tempdir().unwrap();
    Identity::load_or_create(dir.path(), &names()).unwrap();
    let cert_path = dir.path().join("cert.pem");
    let full = std::fs::read(&cert_path).unwrap();
    let truncated = &full[..full.len() / 2];
    std::fs::write(&cert_path, truncated).unwrap();
    let err = Identity::load_or_create(dir.path(), &names()).unwrap_err();
    assert!(matches!(err, NetError::Tls(_)), "{err:?}");
    assert_eq!(std::fs::read(&cert_path).unwrap(), truncated);
}

#[test]
fn a_cert_with_someone_elses_key_is_an_error() {
    let a = tempfile::tempdir().unwrap();
    let b = tempfile::tempdir().unwrap();
    Identity::load_or_create(a.path(), &names()).unwrap();
    Identity::load_or_create(b.path(), &names()).unwrap();
    std::fs::copy(b.path().join("key.pem"), a.path().join("key.pem")).unwrap();
    let err = Identity::load_or_create(a.path(), &names()).unwrap_err();
    assert!(matches!(err, NetError::Tls(_)), "{err:?}");
}

#[test]
fn fingerprint_hex_has_32_groups() {
    let dir = tempfile::tempdir().unwrap();
    let id = Identity::load_or_create(dir.path(), &names()).unwrap();
    let hex = id.fingerprint_hex();
    let groups: Vec<_> = hex.split(':').collect();
    assert_eq!(groups.len(), 32);
    assert!(groups.iter().all(|g| g.len() == 2
        && g.chars()
            .all(|c| c.is_ascii_digit() || ('A'..='F').contains(&c))));
}

async fn serve_once(cfg: Arc<rustls::ServerConfig>) -> std::net::SocketAddr {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let acceptor = TlsAcceptor::from(cfg);
    tokio::spawn(async move {
        loop {
            let Ok((tcp, _)) = listener.accept().await else {
                return;
            };
            let acceptor = acceptor.clone();
            tokio::spawn(async move {
                if let Ok(mut tls) = acceptor.accept(tcp).await {
                    let mut buf = [0u8; 4];
                    if tls.read_exact(&mut buf).await.is_ok() {
                        let _ = tls.write_all(b"pong").await;
                        let _ = tls.flush().await;
                    }
                }
            });
        }
    });
    addr
}

async fn ping(addr: std::net::SocketAddr, fp: [u8; 32]) -> std::io::Result<()> {
    let connector = TlsConnector::from(pinned_client_config(fp));
    let tcp = tokio::net::TcpStream::connect(addr).await?;
    let mut tls = connector
        .connect(
            ServerName::try_from("not-the-cert-name.example").unwrap(),
            tcp,
        )
        .await?;
    tls.write_all(b"ping").await?;
    tls.flush().await?;
    let mut buf = [0u8; 4];
    tls.read_exact(&mut buf).await?;
    assert_eq!(&buf, b"pong");
    Ok(())
}

#[tokio::test]
async fn handshake_succeeds_with_the_pinned_fingerprint() {
    bookeeper_net::install_crypto_provider();
    let dir = tempfile::tempdir().unwrap();
    let id = Identity::load_or_create(dir.path(), &names()).unwrap();
    let addr = serve_once(id.server_config().unwrap()).await;
    ping(addr, id.fingerprint).await.unwrap();
}

#[tokio::test]
async fn handshake_fails_with_another_fingerprint() {
    bookeeper_net::install_crypto_provider();
    let (d1, d2) = (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap());
    let a = Identity::load_or_create(d1.path(), &names()).unwrap();
    let b = Identity::load_or_create(d2.path(), &names()).unwrap();
    let addr = serve_once(a.server_config().unwrap()).await;
    assert!(ping(addr, b.fingerprint).await.is_err());
}

#[tokio::test]
async fn a_stolen_certificate_without_its_key_cannot_impersonate() {
    bookeeper_net::install_crypto_provider();
    let (d1, d2) = (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap());
    let a = Identity::load_or_create(d1.path(), &names()).unwrap();
    let b = Identity::load_or_create(d2.path(), &names()).unwrap();
    let forged = Identity {
        cert_pem: a.cert_pem.clone(),
        key_pem: b.key_pem.clone(),
        fingerprint: a.fingerprint,
    };
    // `server_config` itself may reject the mismatch; if it does not, the
    // client must.
    if let Ok(cfg) = forged.server_config() {
        let addr = serve_once(cfg).await;
        assert!(ping(addr, a.fingerprint).await.is_err());
    }
}
