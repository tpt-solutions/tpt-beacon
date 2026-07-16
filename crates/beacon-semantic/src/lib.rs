//! `beacon-semantic` — the semantic layer, metric definitions, and the
//! query-builder-to-SQL compiler for TPT Beacon.
//!
//! Phase 2 fills in the full compiler across all 7 Keystone data models. This
//! module currently defines the core entities and a placeholder compiler.
//!
//! SPDX-License-Identifier: MIT OR Apache-2.0
use serde::{Deserialize, Serialize};

/// A measurable quantity (e.g. revenue, count of sessions).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Metric {
    pub name: String,
    pub expression: String,
}

/// A grouping/attribute field (e.g. region, date).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Dimension {
    pub name: String,
    pub column: String,
}

/// A backing data source (table or view) in Keystone.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DataSource {
    pub name: String,
    pub table: String,
}

/// A persisted, named query.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SavedQuery {
    pub id: String,
    pub name: String,
    pub definition: String,
}

/// A structured query-builder request.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct QueryRequest {
    pub source: String,
    #[serde(default)]
    pub dimensions: Vec<String>,
    #[serde(default)]
    pub metrics: Vec<String>,
    #[serde(default)]
    pub filters: Vec<String>,
}

/// Errors from the semantic layer / compiler.
#[derive(Debug, thiserror::Error)]
pub enum SemanticError {
    #[error("compile error: {0}")]
    Compile(String),
}

/// Compile a [`QueryRequest`] into SQL. Placeholder — full compiler in Phase 2.
///
/// # Errors
///
/// Returns [`SemanticError::Compile`] for requests that cannot currently be
/// compiled (the compiler is not yet implemented as of Phase 0/1).
pub fn compile(_request: &QueryRequest) -> Result<String, SemanticError> {
    Err(SemanticError::Compile(
        "query-builder-to-SQL compiler not yet implemented (Phase 2)".to_string(),
    ))
}
