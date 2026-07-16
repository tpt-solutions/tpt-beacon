//! `beacon-server` — the main API server for TPT Beacon, built on Axum.
//!
//! Phase 1 adds the Keystone health-check endpoint; later phases add saved
//! queries, dashboards, auth, and real-time Flux subscriptions.
//!
//! SPDX-License-Identifier: MIT OR Apache-2.0
use axum::{routing::get, Router};

/// Build the application router.
pub fn app() -> Router {
    Router::new().route("/healthz", get(healthz))
}

/// Liveness probe.
async fn healthz() -> &'static str {
    "ok"
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()),
        )
        .init();

    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000")
        .await
        .expect("failed to bind server port");
    tracing::info!("beacon-server listening on http://0.0.0.0:3000");

    axum::serve(listener, app()).await.expect("server error");
}
