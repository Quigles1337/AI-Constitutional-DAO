//! Build script for napi-rs
//!
//! This script runs napi-build when the napi feature is enabled,
//! generating the necessary bindings for Node.js.

fn main() {
    #[cfg(feature = "napi")]
    napi_build::setup();
}
