//! Connection pool and client for Keystone.

use sqlx::postgres::{PgPool, PgPoolOptions};
use std::time::Duration;
use tracing::{info, warn};

use crate::error::KeystoneError;
use crate::introspection::{ColumnSchema, ExtensionIndex, FluxTable, TableSchema};
use crate::{KeystoneConfig, Result};

/// A pooled connection client to a Keystone (PostgreSQL-compatible) instance.
///
/// Use [`KeystoneClient::connect`] to create one, then call [`KeystoneClient::pool`]
/// to obtain the underlying `PgPool` for direct queries, or use the convenience
/// methods for schema introspection and health checks.
#[derive(Debug, Clone)]
pub struct KeystoneClient {
    config: KeystoneConfig,
    pool: PgPool,
}

impl KeystoneClient {
    /// Connect to Keystone with the given configuration.
    ///
    /// This creates a connection pool — it does **not** immediately open all
    /// connections; they are created on demand up to `max_connections`.
    pub async fn connect(config: KeystoneConfig) -> Result<Self> {
        let url = config.connection_url();
        let options = PgPoolOptions::new()
            .max_connections(config.max_connections)
            .min_connections(config.min_idle)
            .acquire_timeout(Duration::from_secs(config.connect_timeout_secs))
            .idle_timeout(Duration::from_secs(config.idle_timeout_secs));

        info!(
            host = %config.host,
            port = config.port,
            database = %config.database,
            max_connections = config.max_connections,
            "connecting to Keystone"
        );

        let pool = options.connect(&url).await.map_err(|e| {
            warn!(error = %e, "failed to connect to Keystone");
            KeystoneError::connection_for_config(&config, e)
        })?;

        info!("connected to Keystone at {}", config.connection_url_redacted());
        Ok(Self { config, pool })
    }

    /// Get the underlying connection pool.
    pub fn pool(&self) -> &PgPool {
        &self.pool
    }

    /// Get the config used to create this client.
    pub fn config(&self) -> &KeystoneConfig {
        &self.config
    }

    // ------------------------------------------------------------------
    // Health check
    // ------------------------------------------------------------------

    /// Check that Keystone is reachable and return its version string.
    pub async fn health_check(&self) -> Result<String> {
        let row: (String,) = sqlx::query_as("SELECT version()")
            .fetch_one(&self.pool)
            .await?;
        Ok(row.0)
    }

    // ------------------------------------------------------------------
    // Query execution
    // ------------------------------------------------------------------

    /// Execute a parameterized query and return all resulting rows.
    pub async fn query(&self, sql: &str) -> Result<Vec<sqlx::postgres::PgRow>> {
        let rows = sqlx::query(sql)
            .fetch_all(&self.pool)
            .await
            .map_err(|e| KeystoneError::query(format!("{e}: {sql}")))?;
        Ok(rows)
    }

    /// Execute a write query (INSERT/UPDATE/DELETE) and return affected rows.
    pub async fn execute(&self, sql: &str) -> Result<u64> {
        let result = sqlx::query(sql)
            .execute(&self.pool)
            .await
            .map_err(|e| KeystoneError::query(format!("{e}: {sql}")))?;
        Ok(result.rows_affected())
    }

    // ------------------------------------------------------------------
    // Schema introspection
    // ------------------------------------------------------------------

    /// List all user tables in the public schema.
    pub async fn list_tables(&self) -> Result<Vec<TableSchema>> {
        crate::introspection::list_tables(&self.pool).await
    }

    /// Get columns for a given table.
    pub async fn list_columns(&self, table: &str) -> Result<Vec<ColumnSchema>> {
        crate::introspection::list_columns(&self.pool, table).await
    }

    /// Detect Keystone extension indexes on a given table.
    ///
    /// Returns indexes that use Keystone-specific access methods:
    /// - `spatial` (Meridian)
    /// - `vector` (Prism)
    /// - `graph` (Plexus)
    /// - `time` (Chronos)
    /// - `jsonpath` (Canopy)
    pub async fn detect_extension_indexes(&self, table: &str) -> Result<Vec<ExtensionIndex>> {
        crate::introspection::detect_extension_indexes(&self.pool, table).await
    }

    /// Detect Flux (append-only/event-log) tables and their consumer groups.
    pub async fn detect_flux_tables(&self) -> Result<Vec<FluxTable>> {
        crate::introspection::detect_flux_tables(&self.pool).await
    }

    /// Run a full schema introspection pass across all tables.
    pub async fn full_introspection(&self) -> Result<Vec<TableSchema>> {
        crate::introspection::full_introspection(&self.pool).await
    }
}
