//! `beacon-keystone-client` — a thin Rust wrapper over `tpt-sdk` for accessing
//! TPT Keystone.
//!
//! This crate is the connectivity layer between Beacon and a Keystone instance.
//! It is intentionally minimal at this stage; Phase 1 fills in connection
//! management, schema introspection, and query execution.
//!
//! SPDX-License-Identifier: MIT OR Apache-2.0

/// Connection configuration for a single Keystone instance.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct KeystoneConfig {
    pub host: String,
    pub port: u16,
    pub database: String,
    pub user: String,
    #[serde(default)]
    pub password: String,
}

impl Default for KeystoneConfig {
    fn default() -> Self {
        Self {
            host: "127.0.0.1".to_string(),
            port: 5432,
            database: "keystone".to_string(),
            user: "keystone".to_string(),
            password: String::new(),
        }
    }
}

/// Errors returned by the Keystone client.
#[derive(Debug, thiserror::Error)]
pub enum KeystoneError {
    #[error("connection error: {0}")]
    Connection(String),
    #[error("query error: {0}")]
    Query(String),
}

/// Placeholder client. Real implementation lands in Phase 1.
pub struct KeystoneClient {
    #[allow(dead_code)]
    config: KeystoneConfig,
}

impl KeystoneClient {
    pub fn new(config: KeystoneConfig) -> Self {
        Self { config }
    }
}
