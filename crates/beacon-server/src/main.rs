//! `beacon-server` — the main API server for TPT Beacon, built on Axum.
//!
//! SPDX-License-Identifier: MIT OR Apache-2.0

mod auth;
mod metrics;
mod routes;

use axum::{middleware as axum_mw, Router};
use beacon_anvil_client::{AnvilClient, AnvilConfig};
use beacon_keystone_client::{KeystoneClient, KeystoneConfig};
use beacon_semantic::{CacheConfig, QueryCache};
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::info;

use auth::UserStore;

/// Thread-safe shared query cache.
pub type SharedQueryCache = Arc<RwLock<QueryCache>>;

/// Server configuration loaded from environment variables.
pub struct ServerConfig {
    pub keystone: KeystoneConfig,
    pub anvil: AnvilConfig,
    pub jwt_secret: String,
    pub token_lifetime_hours: u64,
    pub cache: CacheConfig,
    pub listen_addr: String,
}

impl ServerConfig {
    /// Build server configuration from environment variables.
    pub fn from_env() -> Self {
        let keystone = KeystoneConfig {
            host: std::env::var("KEYSTONE_HOST").unwrap_or_else(|_| "127.0.0.1".to_string()),
            port: std::env::var("KEYSTONE_PORT")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(5432),
            database: std::env::var("KEYSTONE_DATABASE")
                .unwrap_or_else(|_| "keystone".to_string()),
            user: std::env::var("KEYSTONE_USER")
                .unwrap_or_else(|_| "keystone".to_string()),
            password: std::env::var("KEYSTONE_PASSWORD").unwrap_or_default(),
            ..Default::default()
        };

        let anvil = AnvilConfig {
            socket: std::env::var("ANVIL_SOCKET").ok().filter(|s| !s.is_empty()),
        };

        let jwt_secret = std::env::var("BEACON_JWT_SECRET")
            .unwrap_or_else(|_| {
                "change-me-in-production-use-a-real-secret-key-at-least-32-bytes".into()
            });

        let token_lifetime_hours = std::env::var("BEACON_TOKEN_HOURS")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(24);

        let listen_addr = std::env::var("BEACON_LISTEN_ADDR")
            .unwrap_or_else(|_| "0.0.0.0:3000".to_string());

        Self {
            keystone,
            anvil,
            jwt_secret,
            token_lifetime_hours,
            cache: CacheConfig::from_env(),
            listen_addr,
        }
    }

    fn default_secret() -> &'static str {
        "change-me-in-production-use-a-real-secret-key-at-least-32-bytes"
    }
}

/// Shared application state accessible from all Axum handlers.
#[derive(Clone)]
pub struct AppState {
    pub keystone: KeystoneClient,
    pub anvil: Arc<AnvilClient>,
    pub user_store: Arc<UserStore>,
    pub rate_limiter: Arc<metrics::RateLimiter>,
    pub query_cache: SharedQueryCache,
    pub snapshot_schedules: Arc<RwLock<Vec<routes::SnapshotSchedule>>>,
}

/// Build the application router with all routes and shared state.
pub fn app(state: AppState) -> Router {
    let api = Router::new()
        .nest("/api", routes::api_router())
        .with_state(state.clone());

    let cors = tower_http::cors::CorsLayer::permissive();
    let trace = tower_http::trace::TraceLayer::new_for_http();

    Router::new()
        .merge(api)
        .layer(axum::extract::Extension(state))
        .layer(axum_mw::from_fn(auth::auth_middleware))
        .layer(axum_mw::from_fn(metrics::metrics_middleware))
        .layer(cors)
        .layer(trace)
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info".into()),
        )
        .init();

    let config = ServerConfig::from_env();

    // Validate JWT secret.
    if config.jwt_secret == ServerConfig::default_secret() {
        tracing::warn!(
            "Using default JWT secret! Set BEACON_JWT_SECRET environment variable for production."
        );
    }
    if config.jwt_secret.len() < 32 {
        anyhow::bail!("BEACON_JWT_SECRET must be at least 32 characters");
    }

    let auth_config = auth::AuthConfig {
        jwt_secret: config.jwt_secret.clone(),
        token_lifetime_hours: config.token_lifetime_hours,
    };

    info!(
        keystone_host = %config.keystone.host,
        keystone_port = config.keystone.port,
        keystone_database = %config.keystone.database,
        anvil_enabled = config.anvil.socket.is_some(),
        cache_max_entries = config.cache.max_entries,
        cache_ttl_secs = config.cache.default_ttl_secs,
        listen_addr = %config.listen_addr,
        "initialising beacon-server"
    );

    // Connect to Keystone.
    let keystone = KeystoneClient::connect(config.keystone).await?;

    // Health-check: verify Keystone is reachable.
    let version = keystone.health_check().await?;
    info!(keystone_version = %version, "Keystone is healthy");

    // Create Anvil client (degrades gracefully if unavailable).
    let anvil = Arc::new(AnvilClient::new(config.anvil));

    // Create user store.
    let user_store = UserStore::new(auth_config);

    // Seed default admin user.
    match user_store.register("admin@localhost", "admin", "Admin", auth::Role::Admin) {
        Ok(_) => info!("default admin user created (admin@localhost / admin)"),
        Err(_) => info!("default admin user already exists"),
    }

    // Create query cache.
    let query_cache = Arc::new(tokio::sync::RwLock::new(
        QueryCache::from_config(&config.cache),
    ));

    let state = AppState {
        keystone,
        anvil,
        user_store,
        rate_limiter: Arc::new(metrics::RateLimiter::new(100, 60)),
        query_cache,
        snapshot_schedules: Arc::new(RwLock::new(Vec::new())),
    };

    let listener = tokio::net::TcpListener::bind(&config.listen_addr).await?;
    info!("beacon-server listening on http://{}", config.listen_addr);

    axum::serve(listener, app(state)).await?;

    Ok(())
}
