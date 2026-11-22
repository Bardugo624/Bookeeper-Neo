//! Makes sure `apps/mobile/dist/index.html` exists so `cargo build` never needs Node.

use std::path::PathBuf;

const PLACEHOLDER: &str = "<!doctype html>\n<html lang=\"it\"><head><meta charset=\"UTF-8\" /><title>Bookeeper</title></head>\n<body><p>Bookeeper</p></body></html>\n";

fn main() {
    let manifest = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR"));
    let dist = manifest.join("../../apps/mobile/dist");
    let index = dist.join("index.html");
    println!("cargo:rerun-if-changed={}", index.display());
    if !index.exists() {
        std::fs::create_dir_all(&dist).expect("create apps/mobile/dist");
        std::fs::write(&index, PLACEHOLDER).expect("write placeholder index.html");
    }
}
