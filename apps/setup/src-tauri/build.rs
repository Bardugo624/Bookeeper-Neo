use std::{fs, path::Path};

fn main() {
    // `tauri::generate_context!` needs the frontend dist folder to exist, so a
    // clean checkout compiles without Node. `npm run build` overwrites this.
    println!("cargo:rerun-if-changed=../dist/index.html");
    println!("cargo:rerun-if-changed=windows/app.manifest");
    let index = Path::new("../dist/index.html");
    if !index.exists() {
        fs::create_dir_all("../dist").expect("create ../dist");
        fs::write(
            index,
            "<!doctype html><html><head><meta charset=\"utf-8\"><title>Bookeeper Setup</title></head><body>Bookeeper Setup</body></html>",
        )
        .expect("write placeholder index.html");
    }

    let target_windows = std::env::var("CARGO_CFG_TARGET_OS").is_ok_and(|v| v == "windows");
    let target_msvc = std::env::var("CARGO_CFG_TARGET_ENV").is_ok_and(|v| v == "msvc");
    if target_windows && target_msvc {
        // Only System32 DLLs are loaded by default: a planted DLL next to the Setup is ignored.
        println!("cargo:rustc-link-arg-bins=/DEPENDENTLOADFLAG:0x800");
    }

    let mut attrs = tauri_build::Attributes::new();
    if target_windows {
        let manifest = fs::read_to_string("windows/app.manifest").expect("read windows/app.manifest");
        attrs = attrs.windows_attributes(tauri_build::WindowsAttributes::new().app_manifest(manifest));
    }
    tauri_build::try_build(attrs).expect("tauri build");
}
