//! `beacon-anvil-client` — a JSON-RPC / IPC client for the TPT Anvil daemon.
//!
//! The Anvil daemon provides AI / natural-language capabilities. This client is
//! designed to degrade gracefully when Anvil is unavailable (see Phase 7).
//!
//! SPDX-License-Identifier: MIT OR Apache-2.0

/// How to reach the Anvil daemon.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, Default)]
pub struct AnvilConfig {
    /// Socket or named-pipe path. `None` means Anvil is disabled.
    #[serde(default)]
    pub socket: Option<String>,
}

/// Errors returned by the Anvil client.
#[derive(Debug, thiserror::Error)]
pub enum AnvilError {
    #[error("anvil unavailable: {0}")]
    Unavailable(String),
    #[error("rpc error: {0}")]
    Rpc(String),
}

/// Placeholder client. Real JSON-RPC implementation lands in Phase 7.
pub struct AnvilClient {
    #[allow(dead_code)]
    config: AnvilConfig,
}

impl AnvilClient {
    pub fn new(config: AnvilConfig) -> Self {
        Self { config }
    }

    pub fn is_available(&self) -> bool {
        self.config.socket.is_some()
    }
}
