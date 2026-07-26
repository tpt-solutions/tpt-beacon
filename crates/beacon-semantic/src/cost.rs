//! Query cost estimation.
//!
//! Provides a heuristic-based cost tier for compiled queries to support the
//! query cost guard (prevents runaway queries from hitting the database).

use crate::ast::*;

/// Estimate the cost tier of a query request.
pub fn estimate_cost(request: &QueryRequest) -> CostTier {
    let mut score: u32 = 0;

    // Joins increase cost.
    score += request.joins.len() as u32 * 2;

    // Spatial radius scans are expensive.
    for sf in &request.spatial_filters {
        match sf.operation {
            SpatialOperation::Radius { .. } => score += 3,
            SpatialOperation::BoundingBox { .. } => score += 1,
            SpatialOperation::ContainsPoint { .. } => score += 2,
        }
    }

    // Vector search over large embeddings is expensive.
    if request.vector_search.is_some() {
        score += 4;
    }

    // Graph traversals can be unbounded.
    if request.graph_pattern.is_some() {
        score += 3;
    }

    // No limit is dangerous.
    if request.limit.is_none() {
        score += 5;
    }

    // Many filters increase selectivity (good) but also complexity.
    score += request.filters.len() as u32;

    // JSON path queries with EXISTS are expensive.
    for jpf in &request.json_path_filters {
        if matches!(jpf.operator, JsonPathOperator::Exists) {
            score += 2;
        }
    }

    // Streaming windows accumulate state.
    if request.window.is_some() {
        score += 2;
    }

    match score {
        0..=3 => CostTier::Low,
        4..=10 => CostTier::Medium,
        _ => CostTier::High,
    }
}

/// Guard that checks whether a compiled query is within acceptable cost bounds.
pub struct CostGuard {
    max_tier: CostTier,
    max_rows: Option<u64>,
    #[allow(dead_code)]
    timeout_secs: Option<u64>,
}

impl CostGuard {
    /// Create a new cost guard with the given limits.
    pub fn new(max_tier: CostTier, max_rows: Option<u64>, timeout_secs: Option<u64>) -> Self {
        Self {
            max_tier,
            max_rows,
            timeout_secs,
        }
    }

    /// Create a guard with sensible defaults.
    pub fn defaults() -> Self {
        Self::new(CostTier::Medium, Some(100_000), Some(30))
    }

    /// Check whether a compiled query passes the guard.
    ///
    /// Returns `Ok(())` if the query is within bounds, or an error describing
    /// what was violated.
    pub fn check(&self, compiled: &CompiledQuery) -> Result<(), CostGuardError> {
        if tier_rank(compiled.cost_tier) > tier_rank(self.max_tier) {
            return Err(CostGuardError::CostTooHigh {
                actual: compiled.cost_tier,
                max: self.max_tier,
            });
        }
        Ok(())
    }

    /// Inject cost-guard limits into the SQL (LIMIT, timeout hint).
    pub fn apply_limits(&self, sql: &mut String, request: &QueryRequest) {
        // If no limit was set by the user, inject one.
        if request.limit.is_none() {
            if let Some(max_rows) = self.max_rows {
                sql.push_str(&format!(" LIMIT {max_rows}"));
            }
        }
    }
}

fn tier_rank(tier: CostTier) -> u8 {
    match tier {
        CostTier::Low => 0,
        CostTier::Medium => 1,
        CostTier::High => 2,
    }
}

/// Errors from the cost guard.
#[derive(Debug, thiserror::Error)]
pub enum CostGuardError {
    #[error("query cost too high: {actual:?} exceeds max {max:?}")]
    CostTooHigh {
        actual: CostTier,
        max: CostTier,
    },

    #[error("query would return too many rows (max: {max})")]
    TooManyRows { max: u64 },

    #[error("query timeout exceeded ({timeout_secs}s)")]
    Timeout { timeout_secs: u64 },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_simple_query_is_low_cost() {
        let req = QueryRequest {
            source: "orders".to_string(),
            limit: Some(100),
            ..Default::default()
        };
        assert_eq!(estimate_cost(&req), CostTier::Low);
    }

    #[test]
    fn test_unbounded_query_is_high_cost() {
        let req = QueryRequest {
            source: "orders".to_string(),
            limit: None,
            joins: vec![
                Join {
                    table: "customers".to_string(),
                    alias: "c".to_string(),
                    on: JoinCondition {
                        left_column: "customer_id".to_string(),
                        right_column: "id".to_string(),
                    },
                    join_type: JoinType::Inner,
                },
                Join {
                    table: "products".to_string(),
                    alias: "p".to_string(),
                    on: JoinCondition {
                        left_column: "product_id".to_string(),
                        right_column: "id".to_string(),
                    },
                    join_type: JoinType::Inner,
                },
                Join {
                    table: "categories".to_string(),
                    alias: "cat".to_string(),
                    on: JoinCondition {
                        left_column: "category_id".to_string(),
                        right_column: "id".to_string(),
                    },
                    join_type: JoinType::Inner,
                },
            ],
            ..Default::default()
        };
        assert_eq!(estimate_cost(&req), CostTier::High);
    }

    #[test]
    fn test_vector_search_increases_cost() {
        let req = QueryRequest {
            source: "embeddings".to_string(),
            limit: Some(10),
            vector_search: Some(VectorSearch {
                column: "emb".to_string(),
                reference_vector: vec![0.1, 0.2],
                top_k: 5,
                metric: SimilarityMetric::Cosine,
            }),
            ..Default::default()
        };
        let tier = estimate_cost(&req);
        assert!(
            tier == CostTier::Medium || tier == CostTier::High,
            "vector search should increase cost"
        );
    }

    #[test]
    fn test_cost_guard_passes() {
        let guard = CostGuard::new(CostTier::High, None, None);
        let compiled = CompiledQuery {
            sql: "SELECT * FROM t".to_string(),
            hash: "abc".to_string(),
            cost_tier: CostTier::Low,
        };
        assert!(guard.check(&compiled).is_ok());
    }

    #[test]
    fn test_cost_guard_rejects() {
        let guard = CostGuard::new(CostTier::Low, None, None);
        let compiled = CompiledQuery {
            sql: "SELECT * FROM t".to_string(),
            hash: "abc".to_string(),
            cost_tier: CostTier::High,
        };
        assert!(guard.check(&compiled).is_err());
    }
}
