//! `beacon-keystone-client` — a thin Rust wrapper over `tpt-sdk` for accessing
//! TPT Keystone.
//!
//! This crate provides connection management, schema introspection (including
//! Keystone extension awareness), query execution, and health-check facilities.
//!
//! SPDX-License-Identifier: MIT OR Apache-2.0

mod error;
mod introspection;
mod pool;

pub use error::KeystoneError;
pub use introspection::*;
pub use pool::KeystoneClient;

use serde::{Deserialize, Serialize};

/// Connection configuration for a single Keystone instance.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeystoneConfig {
    pub host: String,
    pub port: u16,
    pub database: String,
    pub user: String,
    #[serde(default)]
    pub password: String,
    /// Maximum number of connections in the pool (default: 10).
    #[serde(default = "default_max_connections")]
    pub max_connections: u32,
    /// Minimum idle connections (default: 1).
    #[serde(default = "default_min_idle")]
    pub min_idle: u32,
    /// Connection timeout in seconds (default: 10).
    #[serde(default = "default_connect_timeout_secs")]
    pub connect_timeout_secs: u64,
    /// Idle timeout in seconds (default: 600).
    #[serde(default = "default_idle_timeout_secs")]
    pub idle_timeout_secs: u64,
}

fn default_max_connections() -> u32 {
    10
}
fn default_min_idle() -> u32 {
    1
}
fn default_connect_timeout_secs() -> u64 {
    10
}
fn default_idle_timeout_secs() -> u64 {
    600
}

impl Default for KeystoneConfig {
    fn default() -> Self {
        Self {
            host: "127.0.0.1".to_string(),
            port: 5432,
            database: "keystone".to_string(),
            user: "keystone".to_string(),
            password: String::new(),
            max_connections: default_max_connections(),
            min_idle: default_min_idle(),
            connect_timeout_secs: default_connect_timeout_secs(),
            idle_timeout_secs: default_idle_timeout_secs(),
        }
    }
}

impl KeystoneConfig {
    /// Build a PostgreSQL connection URL from the config fields.
    pub fn connection_url(&self) -> String {
        format!(
            "postgres://{}:{}@{}:{}/{}",
            self.user, self.password, self.host, self.port, self.database
        )
    }

    /// Build a PostgreSQL connection URL without the password (for logging).
    pub fn connection_url_redacted(&self) -> String {
        format!(
            "postgres://{}:***@{}:{}/{}",
            self.user, self.host, self.port, self.database
        )
    }
}

/// Row returned by arbitrary queries. Wraps sqlx's `PgRow`.
pub type Row = sqlx::postgres::PgRow;

/// Result type alias for this crate.
pub type Result<T> = std::result::Result<T, KeystoneError>;
