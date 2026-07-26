//! `beacon-anvil-client` — JSON-RPC / IPC client for the TPT Anvil daemon.
//!
//! The Anvil daemon provides AI / natural-language capabilities for the Beacon
//! analytics platform. This client degrades gracefully when Anvil is unavailable.
//!
//! Communication is via TCP on loopback. The `socket` config field holds the
//! port number (e.g. `"9553"`), or is `None` when Anvil is disabled.
//!
//! SPDX-License-Identifier: MIT OR Apache-2.0

use serde::{Deserialize, Serialize};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpStream;

/// How to reach the Anvil daemon.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, Default)]
pub struct AnvilConfig {
    /// TCP port on 127.0.0.1 (e.g. `"9553"`). `None` means Anvil is disabled.
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
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),
}

// ── JSON-RPC types ──────────────────────────────────────────────

#[derive(Debug, Serialize)]
struct JsonRpcRequest {
    jsonrpc: &'static str,
    method: String,
    params: serde_json::Value,
    id: u64,
}

#[derive(Debug, Deserialize)]
struct JsonRpcResponse {
    #[allow(dead_code)]
    jsonrpc: String,
    result: Option<serde_json::Value>,
    error: Option<JsonRpcError>,
    #[allow(dead_code)]
    id: u64,
}

#[derive(Debug, Deserialize)]
struct JsonRpcError {
    code: i64,
    message: String,
}

// ── Public request / response types ─────────────────────────────

/// Schema context sent to Anvil for NL-to-query generation.
#[derive(Debug, Clone, Serialize)]
pub struct SchemaContext {
    pub tables: Vec<TableContext>,
}

#[derive(Debug, Clone, Serialize)]
pub struct TableContext {
    pub name: String,
    pub columns: Vec<ColumnContext>,
    pub extensions: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ColumnContext {
    pub name: String,
    pub data_type: String,
}

/// The result of an NL-to-query conversion.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NlQueryResult {
    /// Natural-language interpretation of the request.
    pub interpretation: String,
    /// The compiled SQL query.
    pub sql: String,
    /// Confidence score 0.0 – 1.0.
    pub confidence: f64,
    /// Suggested follow-up questions.
    pub suggestions: Vec<String>,
}

/// An AI-generated explanation of a query result.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueryExplanation {
    pub explanation: String,
    pub insights: Vec<String>,
    pub chart_recommendation: Option<String>,
}

/// AI-generated query suggestion.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuerySuggestion {
    pub label: String,
    pub description: String,
    pub query_hint: String,
}

// ── Client ──────────────────────────────────────────────────────

/// JSON-RPC client for the Anvil daemon.
pub struct AnvilClient {
    config: AnvilConfig,
    next_id: std::sync::atomic::AtomicU64,
}

impl AnvilClient {
    pub fn new(config: AnvilConfig) -> Self {
        Self {
            config,
            next_id: std::sync::atomic::AtomicU64::new(1),
        }
    }

    /// Returns `true` if Anvil is configured (socket/port present).
    pub fn is_available(&self) -> bool {
        self.config.socket.is_some()
    }

    /// Send a raw JSON-RPC request and get the result value.
    async fn rpc(
        &self,
        method: &str,
        params: serde_json::Value,
    ) -> Result<serde_json::Value, AnvilError> {
        let port_str = self
            .config
            .socket
            .as_ref()
            .ok_or_else(|| AnvilError::Unavailable("no socket configured".into()))?;

        let port: u16 = port_str
            .parse()
            .map_err(|_| AnvilError::Unavailable(format!("invalid port: {port_str}")))?;

        let id = self.next_id.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let request = JsonRpcRequest {
            jsonrpc: "2.0",
            method: method.to_string(),
            params,
            id,
        };

        let payload = serde_json::to_string(&request)?;
        let addr = format!("127.0.0.1:{port}");

        let mut stream = TcpStream::connect(&addr).await.map_err(|e| {
            AnvilError::Unavailable(format!("cannot connect to Anvil at {addr}: {e}"))
        })?;

        // Write request with newline delimiter.
        stream.write_all(payload.as_bytes()).await?;
        stream.write_all(b"\n").await?;

        // Read response line.
        let reader = BufReader::new(stream);
        let mut lines = reader.lines();
        if let Some(line) = lines.next_line().await? {
            let resp: JsonRpcResponse = serde_json::from_str(&line)?;
            if let Some(err) = resp.error {
                return Err(AnvilError::Rpc(format!(
                    "{} (code {})",
                    err.message, err.code
                )));
            }
            return resp
                .result
                .ok_or_else(|| AnvilError::Rpc("empty result".into()));
        }
        Err(AnvilError::Rpc("no response from Anvil".into()))
    }

    // ── High-level API ──────────────────────────────────────────

    /// Convert a natural-language prompt into a compiled query.
    pub async fn nl_to_query(
        &self,
        prompt: &str,
        schema: &SchemaContext,
    ) -> Result<NlQueryResult, AnvilError> {
        let params = serde_json::json!({
            "prompt": prompt,
            "schema": schema,
        });
        let value = self.rpc("anvil.nl_to_query", params).await?;
        Ok(serde_json::from_value(value)?)
    }

    /// Explain a query result in natural language.
    pub async fn explain_result(
        &self,
        sql: &str,
        column_names: &[String],
        row_count: usize,
    ) -> Result<QueryExplanation, AnvilError> {
        let params = serde_json::json!({
            "sql": sql,
            "columns": column_names,
            "row_count": row_count,
        });
        let value = self.rpc("anvil.explain_result", params).await?;
        Ok(serde_json::from_value(value)?)
    }

    /// Get AI-powered query suggestions based on schema and context.
    pub async fn suggest_queries(
        &self,
        schema: &SchemaContext,
        recent_tables: &[String],
    ) -> Result<Vec<QuerySuggestion>, AnvilError> {
        let params = serde_json::json!({
            "schema": schema,
            "recent_tables": recent_tables,
        });
        let value = self.rpc("anvil.suggest_queries", params).await?;
        Ok(serde_json::from_value(value)?)
    }

    /// Autocomplete a partial query or NL prompt.
    pub async fn autocomplete(
        &self,
        partial: &str,
        schema: &SchemaContext,
    ) -> Result<Vec<String>, AnvilError> {
        let params = serde_json::json!({
            "partial": partial,
            "schema": schema,
        });
        let value = self.rpc("anvil.autocomplete", params).await?;
        Ok(serde_json::from_value(value)?)
    }

    /// Health check — returns daemon version if reachable.
    pub async fn health_check(&self) -> Result<String, AnvilError> {
        let value = self.rpc("anvil.version", serde_json::json!({})).await?;
        Ok(value.as_str().unwrap_or("unknown").to_string())
    }
}
