//! `beacon-semantic` — the semantic layer, metric definitions, and the
//! query-builder-to-SQL compiler for TPT Beacon.
//!
//! The compiler supports all 7 Keystone data models:
//! - **Relational**: standard SQL filters, joins, group-by, aggregates
//! - **Meridian** (geospatial): `ST_*` filter/predicate support
//! - **Prism** (vector): `vector_search()`/similarity ordering
//! - **Chronos** (time-series): `time_bucket()`/`moving_average()`
//! - **Plexus** (graph): `MATCH` pattern-query passthrough
//! - **Canopy** (document): JSON path operators
//! - **Flux** (streaming): windowed queries over event logs
//!
//! SPDX-License-Identifier: MIT OR Apache-2.0

pub mod ast;
pub mod cache;
pub mod compiler;
pub mod cost;

pub use ast::*;
pub use cache::QueryCache;
pub use compiler::compile;
pub use cost::{CostGuard, CostGuardError};

/// Errors from the semantic layer / compiler.
#[derive(Debug, thiserror::Error)]
pub enum SemanticError {
    #[error("compile error: {0}")]
    Compile(String),
}
