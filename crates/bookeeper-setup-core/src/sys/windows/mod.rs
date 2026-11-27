// Windows implementation of `System`; filled in by the setup-core-win task.

use crate::sys::{System, UnsupportedSystem};

pub fn platform() -> Box<dyn System> {
    Box::new(UnsupportedSystem)
}
