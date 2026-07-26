//! Error types for the Keystone client.

use crate::KeystoneConfig;

/// Errors returned by the Keystone client.
#[derive(Debug, thiserror::Error)]
pub enum KeystoneError {
    #[error("connection error: {0}")]
    Connection(String),

    #[error("pool error: {0}")]
    Pool(String),

    #[error("query error: {0}")]
    Query(String),

    #[error("introspection error: {0}")]
    Introspection(String),

    #[error("timeout after {timeout_secs}s")]
    Timeout { timeout_secs: u64 },

    #[error(transparent)]
    Sqlx(#[from] sqlx::Error),

    #[error(transparent)]
    Anyhow(#[from] anyhow::Error),
}

impl KeystoneError {
    /// Create a connection error from a message.
    pub fn connection(msg: impl Into<String>) -> Self {
        Self::Connection(msg.into())
    }

    /// Create a query error from a message.
    pub fn query(msg: impl Into<String>) -> Self {
        Self::Query(msg.into())
    }

    /// Create an introspection error from a message.
    pub fn introspection(msg: impl Into<String>) -> Self {
        Self::Introspection(msg.into())
    }

    /// Build a [`KeystoneError::Connection`] from a config (for logging).
    pub fn connection_for_config(config: &KeystoneConfig, source: impl std::fmt::Display) -> Self {
        Self::Connection(format!(
            "failed to connect to Keystone at {}: {source}",
            config.connection_url_redacted()
        ))
    }
}
