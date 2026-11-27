//! Core logic of the Bookeeper Setup: file format, command lines, folders,
//! progress model and the system interface. No Tauri here.

pub mod autostart;
pub mod cmdline;
pub mod folder;
pub mod log;
pub mod ops;
pub mod payload;
pub mod progress;
pub mod quiet;
pub mod sys;
pub mod version;
