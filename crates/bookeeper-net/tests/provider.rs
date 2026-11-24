#[test]
fn installing_the_provider_twice_is_fine() {
    bookeeper_net::install_crypto_provider();
    bookeeper_net::install_crypto_provider();
    assert!(rustls::crypto::CryptoProvider::get_default().is_some());
}
