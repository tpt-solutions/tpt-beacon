//! `beacon-server` — the main API server for TPT Beacon, built on Axum.
//!
//! SPDX-License-Identifier: MIT OR Apache-2.0

mod auth;
mod metrics;
mod routes;

use axum::{middleware as axum_mw, Router};
use beacon_anvil_client::{AnvilClient, AnvilConfig};
use beacon_keystone_client::{KeystoneClient, KeystoneConfig};
use std::sync::Arc;
use tracing::info;

use auth::UserStore;

/// Shared application state accessible from all Axum handlers.
#[derive(Clone)]
pub struct AppState {
    pub keystone: KeystoneClient,
    pub anvil: Arc<AnvilClient>,
    pub user_store: Arc<UserStore>,
    pub rate_limiter: Arc<metrics::RateLimiter>,
}

/// Build the application router with all routes and shared state.
pub fn app(state: AppState) -> Router {
    let api = Router::new()
        .nest("/api", routes::api_router())
        .with_state(state);

    let cors = tower_http::cors::CorsLayer::permissive();
    let trace = tower_http::trace::TraceLayer::new_for_http();

    Router::new()
        .merge(api)
        .layer(axum_mw::from_fn(auth::auth_middleware))
        .layer(axum_mw::from_fn(metrics::metrics_middleware))
        .layer(cors)
        .layer(trace)
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()),
        )
        .init();

    // Build Keystone config from environment.
    let keystone_config = KeystoneConfig {
        host: std::env::var("KEYSTONE_HOST").unwrap_or_else(|_| "127.0.0.1".to_string()),
        port: std::env::var("KEYSTONE_PORT")
            .unwrap_or_else(|_| "5432".to_string())
            .parse()
            .unwrap_or(5432),
        database: std::env::var("KEYSTONE_DATABASE").unwrap_or_else(|_| "keystone".to_string()),
        user: std::env::var("KEYSTONE_USER").unwrap_or_else(|_| "keystone".to_string()),
        password: std::env::var("KEYSTONE_PASSWORD").unwrap_or_default(),
        ..Default::default()
    };

    // Build Anvil config from environment.
    let anvil_config = AnvilConfig {
        socket: std::env::var("ANVIL_SOCKET").ok().filter(|s| !s.is_empty()),
    };

    // Build auth config from environment.
    let auth_config = auth::AuthConfig {
        jwt_secret: std::env::var("BEACON_JWT_SECRET")
            .unwrap_or_else(|_| "change-me-in-production-use-a-real-secret-key-at-least-32-bytes".into()),
        token_lifetime_hours: std::env::var("BEACON_TOKEN_HOURS")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(24),
    };

    info!(
        keystone_host = %keystone_config.host,
        keystone_port = keystone_config.port,
        keystone_database = %keystone_config.database,
        anvil_enabled = anvil_config.socket.is_some(),
        "initialising beacon-server"
    );

    // Connect to Keystone.
    let keystone = KeystoneClient::connect(keystone_config).await?;

    // Health-check: verify Keystone is reachable.
    let version = keystone.health_check().await?;
    info!(keystone_version = %version, "Keystone is healthy");

    // Create Anvil client (degrades gracefully if unavailable).
    let anvil = Arc::new(AnvilClient::new(anvil_config));

    // Create user store.
    let user_store = UserStore::new(auth_config);

    // Seed default admin user.
    match user_store.register("admin@localhost", "admin", "Admin", auth::Role::Admin) {
        Ok(_) => info!("default admin user created (admin@localhost / admin)"),
        Err(_) => info!("default admin user already exists"),
    }

    let state = AppState {
        keystone,
        anvil,
        user_store,
        rate_limiter: Arc::new(metrics::RateLimiter::new(100, 60)),
    };

    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await?;
    info!("beacon-server listening on http://0.0.0.0:3000");

    axum::serve(listener, app(state)).await?;

    Ok(())
}
