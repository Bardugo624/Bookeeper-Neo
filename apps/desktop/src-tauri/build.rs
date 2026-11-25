use std::{fs, path::Path};

fn main() {
    // `tauri::generate_context!` needs the frontend dist folder to exist, so a
    // clean checkout compiles without Node. `npm run build` overwrites this.
    println!("cargo:rerun-if-changed=../dist/index.html");
    let index = Path::new("../dist/index.html");
    if !index.exists() {
        fs::create_dir_all("../dist").expect("create ../dist");
        fs::write(
            index,
            "<!doctype html><html><head><meta charset=\"utf-8\"><title>Bookeeper</title></head><body>Bookeeper</body></html>",
        )
        .expect("write placeholder index.html");
    }
    tauri_build::build();
}
