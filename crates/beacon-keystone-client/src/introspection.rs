//! Schema introspection for Keystone.
//!
//! Provides functions to discover tables, columns, Keystone extension indexes
//! (Meridian/Prism/Plexus/Chronos/Canopy), and Flux (event-log) tables.

use sqlx::PgPool;
use tracing::{debug, info};

use crate::error::KeystoneError;
use crate::Result;

// ------------------------------------------------------------------
// Data types
// ------------------------------------------------------------------

/// Represents a user table in the Keystone database.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct TableSchema {
    pub schema: String,
    pub name: String,
    pub columns: Vec<ColumnSchema>,
    pub extension_indexes: Vec<ExtensionIndex>,
    pub is_flux: bool,
}

/// A single column in a table.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ColumnSchema {
    pub name: String,
    pub data_type: String,
    pub is_nullable: bool,
    pub column_default: Option<String>,
    pub ordinal_position: i32,
}

/// A Keystone extension index detected on a table.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ExtensionIndex {
    pub index_name: String,
    pub column_name: String,
    /// The Keystone extension this index supports.
    pub extension: KeystoneExtension,
    /// The access method name (e.g. "gist", "gin", "ivfflat", "hnsw").
    pub access_method: String,
}

/// The seven Keystone data-model extensions.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum KeystoneExtension {
    /// Meridian — geospatial (`USING SPATIAL`).
    Meridian,
    /// Prism — vector similarity (`USING VECTOR`).
    Prism,
    /// Plexus — graph traversal (`USING GRAPH`).
    Plexus,
    /// Chronos — time-series (`USING TIME`).
    Chronos,
    /// Canopy — JSON document (`USING JSONPATH`).
    Canopy,
    /// Flux — append-only event log / streaming.
    Flux,
    /// Standard relational index (not a Keystone extension).
    Standard,
}

impl KeystoneExtension {
    /// Human-readable label.
    pub fn label(&self) -> &'static str {
        match self {
            Self::Meridian => "Meridian (geospatial)",
            Self::Prism => "Prism (vector)",
            Self::Plexus => "Plexus (graph)",
            Self::Chronos => "Chronos (time-series)",
            Self::Canopy => "Canopy (JSON document)",
            Self::Flux => "Flux (streaming)",
            Self::Standard => "Standard",
        }
    }
}

impl std::fmt::Display for KeystoneExtension {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.label())
    }
}

/// A Flux (append-only / event-log) table.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct FluxTable {
    pub schema: String,
    pub table: String,
    /// Consumer groups that have been registered against this event log.
    pub consumer_groups: Vec<String>,
}

// ------------------------------------------------------------------
// Introspection queries
// ------------------------------------------------------------------

/// List all user tables in the `public` schema.
pub async fn list_tables(pool: &PgPool) -> Result<Vec<TableSchema>> {
    info!("introspecting tables in public schema");

    let rows: Vec<(String, String)> = sqlx::query_as(
        r#"
        SELECT table_schema, table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
        ORDER BY table_name
        "#,
    )
    .fetch_all(pool)
    .await
    .map_err(|e| KeystoneError::introspection(format!("failed to list tables: {e}")))?;

    let mut tables = Vec::with_capacity(rows.len());
    for (schema, name) in rows {
        let columns = list_columns(pool, &name).await?;
        let extension_indexes = detect_extension_indexes(pool, &name).await?;
        let is_flux = detect_is_flux(pool, &name).await.unwrap_or(false);

        tables.push(TableSchema {
            schema,
            name,
            columns,
            extension_indexes,
            is_flux,
        });
    }

    info!(count = tables.len(), "discovered tables");
    Ok(tables)
}

/// Get columns for a given table.
pub async fn list_columns(pool: &PgPool, table: &str) -> Result<Vec<ColumnSchema>> {
    debug!(table = %table, "introspecting columns");

    let rows: Vec<(String, String, bool, Option<String>, i32)> = sqlx::query_as(
        r#"
        SELECT
            column_name,
            data_type,
            is_nullable,
            column_default,
            ordinal_position
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = $1
        ORDER BY ordinal_position
        "#,
    )
    .bind(table)
    .fetch_all(pool)
    .await
    .map_err(|e| KeystoneError::introspection(format!("failed to list columns for {table}: {e}")))?;

    Ok(rows
        .into_iter()
        .map(|(name, data_type, is_nullable, column_default, ordinal_position)| {
            ColumnSchema {
                name,
                data_type,
                is_nullable,
                column_default,
                ordinal_position,
            }
        })
        .collect())
}

/// Detect Keystone extension indexes on a table.
///
/// This inspects `pg_class`, `pg_am`, and `pg_index` to find indexes that use
/// Keystone-specific access methods (gist with spatial operators, ivfflat/hnsw
/// for vectors, custom graph/time/jsonpath access methods).
pub async fn detect_extension_indexes(pool: &PgPool, table: &str) -> Result<Vec<ExtensionIndex>> {
    debug!(table = %table, "detecting extension indexes");

    let rows: Vec<(String, String, String, String)> = sqlx::query_as(
        r#"
        SELECT
            i.relname AS index_name,
            a.attname AS column_name,
            am.amname AS access_method,
            pg_get_expr(i.relpages::regclass, i.oid::regclass, true) AS index_def
        FROM pg_class t
        JOIN pg_index ix ON t.oid = ix.indrelid
        JOIN pg_class i ON i.oid = ix.indexrelid
        JOIN pg_am am ON i.relam = am.oid
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
        WHERE t.relname = $1
          AND t.relnamespace = 'public'::regnamespace
          AND ix.indisprimary = false
        ORDER BY i.relname
        "#,
    )
    .bind(table)
    .fetch_all(pool)
    .await
    .map_err(|e| {
        KeystoneError::introspection(format!("failed to detect indexes for {table}: {e}"))
    })?;

    let mut indexes = Vec::new();

    for (index_name, column_name, access_method, _index_def) in rows {
        let extension = classify_access_method(&access_method);
        indexes.push(ExtensionIndex {
            index_name,
            column_name,
            extension,
            access_method,
        });
    }

    // Also check for Keystone-specific index types via pg_extension and operator classes.
    let opclass_rows: Vec<(String, String, String)> = sqlx::query_as(
        r#"
        SELECT
            i.relname AS index_name,
            a.attname AS column_name,
            am.amname AS access_method
        FROM pg_class t
        JOIN pg_index ix ON t.oid = ix.indrelid
        JOIN pg_class i ON i.oid = ix.indexrelid
        JOIN pg_am am ON i.relam = am.oid
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
        JOIN pg_opclass oc ON oc.oid = ANY(ix.indclass)
        JOIN pg_operator op ON op.oid = oc.opcfamily
        WHERE t.relname = $1
          AND t.relnamespace = 'public'::regnamespace
          AND (
              op.oprname IN ('&&', '~', '@>', '<@', '<<', '>>', '|=', '&=', '<<|', '|>>')
              OR am.amname IN ('ivfflat', 'hnsw')
          )
        GROUP BY i.relname, a.attname, am.amname
        "#,
    )
    .bind(table)
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    for (index_name, column_name, access_method) in opclass_rows {
        // Avoid duplicates.
        if !indexes.iter().any(|i| i.index_name == index_name) {
            let extension = classify_access_method(&access_method);
            indexes.push(ExtensionIndex {
                index_name,
                column_name,
                extension,
                access_method,
            });
        }
    }

    debug!(table = %table, count = indexes.len(), "found extension indexes");
    Ok(indexes)
}

/// Classify a PostgreSQL access method into a Keystone extension.
fn classify_access_method(amname: &str) -> KeystoneExtension {
    match amname {
        // Meridian uses GiST with bounding-box operators.
        "gist" | "spgist" => KeystoneExtension::Meridian,
        // Prism uses vector-specific index types.
        "ivfflat" | "hnsw" => KeystoneExtension::Prism,
        // Plexus graph indexes.
        "graph" | "btree_graph" => KeystoneExtension::Plexus,
        // Chronos time-series indexes.
        "timeseries" | "brin" => KeystoneExtension::Chronos,
        // Canopy JSON document indexes.
        "jsonb_path" | "gin" => KeystoneExtension::Canopy,
        // Flux append-only / streaming indexes.
        "appendonly" | "flux" => KeystoneExtension::Flux,
        // Standard btree and other generic indexes.
        _ => KeystoneExtension::Standard,
    }
}

/// Check if a table is an append-only / event-log (Flux) table.
///
/// Heuristics:
/// 1. Table name ends with `_events`, `_log`, or `_stream`.
/// 2. Table has an `_offset` or `_sequence` column (common in event logs).
/// 3. A companion `_consumer_groups` table exists.
async fn detect_is_flux(pool: &PgPool, table: &str) -> Result<bool> {
    // Check naming heuristic.
    let is_event_log_name = table.ends_with("_events")
        || table.ends_with("_log")
        || table.ends_with("_stream");

    if is_event_log_name {
        return Ok(true);
    }

    // Check for offset/sequence column.
    let has_offset: (bool,) = sqlx::query_as(
        r#"
        SELECT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = $1
              AND column_name IN ('_offset', '_sequence', '_seq', 'event_offset')
        )
        "#,
    )
    .bind(table)
    .fetch_one(pool)
    .await
    .map_err(|e| KeystoneError::introspection(format!("flux check failed for {table}: {e}")))?;

    if has_offset.0 {
        return Ok(true);
    }

    // Check for companion consumer_groups table.
    let consumer_table = format!("{table}_consumer_groups");
    let has_cg: (bool,) = sqlx::query_as(
        r#"
        SELECT EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name = $1
        )
        "#,
    )
    .bind(&consumer_table)
    .fetch_one(pool)
    .await
    .map_err(|e| KeystoneError::introspection(format!("flux check failed for {table}: {e}")))?;

    Ok(has_cg.0)
}

/// Detect all Flux (event-log) tables and their consumer groups.
pub async fn detect_flux_tables(pool: &PgPool) -> Result<Vec<FluxTable>> {
    info!("detecting Flux event-log tables");

    // Get all tables and check which are Flux.
    let table_names: Vec<(String,)> = sqlx::query_as(
        r#"
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
        ORDER BY table_name
        "#,
    )
    .fetch_all(pool)
    .await
    .map_err(|e| KeystoneError::introspection(format!("failed to list tables for flux: {e}")))?;

    let mut flux_tables = Vec::new();

    for (name,) in table_names {
        if detect_is_flux(pool, &name).await.unwrap_or(false) {
            let consumer_groups = list_consumer_groups(pool, &name).await.unwrap_or_default();
            flux_tables.push(FluxTable {
                schema: "public".to_string(),
                table: name,
                consumer_groups,
            });
        }
    }

    info!(count = flux_tables.len(), "found Flux event-log tables");
    Ok(flux_tables)
}

/// List consumer groups for a Flux table.
async fn list_consumer_groups(pool: &PgPool, table: &str) -> Result<Vec<String>> {
    let cg_table = format!("{table}_consumer_groups");
    let exists: (bool,) = sqlx::query_as(
        r#"
        SELECT EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name = $1
        )
        "#,
    )
    .bind(&cg_table)
    .fetch_one(pool)
    .await
    .map_err(|e| KeystoneError::introspection(format!("{e}")))?;

    if !exists.0 {
        return Ok(Vec::new());
    }

    // Try to get consumer group names from the companion table.
    // The consumer group table schema varies; we try a generic approach.
    // Try common column names and fall back to empty if none work.
    let rows: Vec<(String,)> = sqlx::query_as(&format!(
        "SELECT name FROM \"{cg_table}\" LIMIT 100"
    ))
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    if !rows.is_empty() {
        return Ok(rows.into_iter().map(|(name,)| name).collect());
    }

    let rows: Vec<(String,)> = sqlx::query_as(&format!(
        "SELECT group_name FROM \"{cg_table}\" LIMIT 100"
    ))
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    if !rows.is_empty() {
        return Ok(rows.into_iter().map(|(name,)| name).collect());
    }

    let rows: Vec<(String,)> = sqlx::query_as(&format!(
        "SELECT consumer_group_name FROM \"{cg_table}\" LIMIT 100"
    ))
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    Ok(rows.into_iter().map(|(name,)| name).collect())
}

/// Run a full schema introspection pass across all tables.
pub async fn full_introspection(pool: &PgPool) -> Result<Vec<TableSchema>> {
    list_tables(pool).await
}
