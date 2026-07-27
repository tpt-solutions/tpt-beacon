//! Query-builder-to-SQL compiler.
//!
//! Translates a [`QueryRequest`] AST into a SQL string. Supports all 7
//! Keystone data models through dedicated compilation strategies.

use crate::ast::*;
use crate::cost::estimate_cost;
use crate::sql_safety::{safe_identifier, validate_expression, validate_graph_pattern, validate_time_interval};
use crate::SemanticError;
use sha2::{Digest, Sha256};

/// Compile a [`QueryRequest`] into a [`CompiledQuery`].
///
/// # Errors
///
/// Returns [`SemanticError::Compile`] if the request cannot be translated to
/// valid SQL.
pub fn compile(request: &QueryRequest) -> Result<CompiledQuery, SemanticError> {
    let mut ctx = CompileContext::new(request)?;
    ctx.compile_request()?;

    let sql = ctx.sql;
    let hash = compute_hash(&sql);
    let cost_tier = estimate_cost(request);

    Ok(CompiledQuery {
        sql,
        hash,
        cost_tier,
    })
}

fn compute_hash(sql: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(sql.as_bytes());
    hex::encode(hasher.finalize())
}

// ------------------------------------------------------------------
// Compilation context
// ------------------------------------------------------------------

struct CompileContext<'a> {
    request: &'a QueryRequest,
    sql: String,
    from_clause: String,
    joins: Vec<String>,
    where_clauses: Vec<String>,
    group_by: Vec<String>,
    select: Vec<String>,
    order_by: Vec<String>,
    limit: Option<u64>,
    offset: Option<u64>,
    params: Vec<String>,
    param_index: usize,
}

impl<'a> CompileContext<'a> {
    fn new(request: &'a QueryRequest) -> Result<Self, SemanticError> {
        if request.source.is_empty() {
            return Err(SemanticError::Compile(
                "data source is required".to_string(),
            ));
        }
        Ok(Self {
            request,
            sql: String::new(),
            from_clause: safe_identifier(request.source.as_str())
                .map_err(|e| SemanticError::Compile(e))?,
            joins: Vec::new(),
            where_clauses: Vec::new(),
            group_by: Vec::new(),
            select: Vec::new(),
            order_by: Vec::new(),
            limit: request.limit,
            offset: request.offset,
            params: Vec::new(),
            param_index: 0,
        })
    }

    fn next_param(&mut self) -> String {
        self.param_index += 1;
        format!("${}", self.param_index)
    }

    fn compile_request(&mut self) -> Result<(), SemanticError> {
        // 1. Compile joins first (they affect FROM clause).
        for join in &self.request.joins {
            self.compile_join(join)?;
        }

        // 2. Compile spatial filters (Meridian) into WHERE.
        for sf in &self.request.spatial_filters {
            self.compile_spatial_filter(sf)?;
        }

        // 3. Compile JSON path filters (Canopy) into WHERE.
        for jpf in &self.request.json_path_filters {
            self.compile_json_path_filter(jpf)?;
        }

        // 4. Compile standard filters into WHERE.
        for filter in &self.request.filters {
            self.compile_filter(filter)?;
        }

        // 5. Compile graph pattern (Plexus) into WHERE (passthrough).
        if let Some(gp) = &self.request.graph_pattern {
            self.compile_graph_pattern(gp)?;
        }

        // 6. Compile SELECT columns.
        self.compile_select()?;

        // 7. Compile GROUP BY.
        self.compile_group_by()?;

        // 8. Compile ORDER BY.
        self.compile_order_by()?;

        // 9. Assemble the final SQL.
        self.assemble_sql()?;

        Ok(())
    }

    // ------------------------------------------------------------------
    // SELECT
    // ------------------------------------------------------------------

    fn compile_select(&mut self) -> Result<(), SemanticError> {
        // Time bucket (Chronos) generates a time_bucket() expression.
        if let Some(tb) = &self.request.time_bucket {
            let bucket_expr = match &tb.interval {
                TimeInterval::Second => format!(
                    "date_trunc('second', \"{}\")",
                    tb.time_column
                ),
                TimeInterval::Minute => format!(
                    "date_trunc('minute', \"{}\")",
                    tb.time_column
                ),
                TimeInterval::Hour => format!(
                    "date_trunc('hour', \"{}\")",
                    tb.time_column
                ),
                TimeInterval::Day => format!(
                    "date_trunc('day', \"{}\")",
                    tb.time_column
                ),
                TimeInterval::Week => format!(
                    "date_trunc('week', \"{}\")",
                    tb.time_column
                ),
                TimeInterval::Month => format!(
                    "date_trunc('month', \"{}\")",
                    tb.time_column
                ),
                TimeInterval::Quarter => format!(
                    "date_trunc('quarter', \"{}\")",
                    tb.time_column
                ),
                TimeInterval::Year => format!(
                    "date_trunc('year', \"{}\")",
                    tb.time_column
                ),
                TimeInterval::Custom(expr) => {
                    validate_time_interval(expr)
                        .map_err(|e| SemanticError::Compile(e))?
                },
            };
            self.select.push(format!("{bucket_expr} AS \"time_bucket\""));
        }

        // Dimensions.
        for dim in &self.request.dimensions {
            let safe_col = safe_identifier(&dim.column)
                .map_err(|e| SemanticError::Compile(e))?;
            let col = if let Some(alias) = &dim.table_alias {
                let safe_alias = safe_identifier(alias)
                    .map_err(|e| SemanticError::Compile(e))?;
                format!("{safe_alias}.{safe_col}")
            } else {
                safe_col
            };
            let safe_name = safe_identifier(&dim.name)
                .map_err(|e| SemanticError::Compile(e))?;
            self.select.push(format!("{col} AS {safe_name}"));
        }

        // Metrics.
        for metric in &self.request.metrics {
            let validated_expr = validate_expression(&metric.expression)
                .map_err(|e| SemanticError::Compile(e))?;
            let safe_name = safe_identifier(&metric.name)
                .map_err(|e| SemanticError::Compile(e))?;
            self.select
                .push(format!("({validated_expr}) AS {safe_name}"));
        }

        // Vector search results (Prism): add distance column.
        if let Some(vs) = &self.request.vector_search {
            let dist_fn = match vs.metric {
                SimilarityMetric::L2 => "l2_distance",
                SimilarityMetric::Cosine => "cosine_distance",
                SimilarityMetric::InnerProduct => "inner_product_distance",
            };
            self.select.push(format!(
                "{dist_fn}(\"{}\", ${{vector_ref}}) AS \"_similarity\"",
                vs.column
            ));
        }

        // Moving average (Chronos).
        if let Some(ma) = &self.request.moving_average {
            let order = ma
                .order_by
                .as_deref()
                .unwrap_or(&ma.column);
            self.select.push(format!(
                "AVG(\"{}\") OVER (ORDER BY \"{}\" ROWS BETWEEN {} PRECEDING AND CURRENT ROW) AS \"{}_ma{}\"",
                ma.column, order, ma.window_size, ma.column, ma.window_size
            ));
        }

        // Streaming window (Flux) — add window bounds.
        if let Some(_win) = &self.request.window {
            self.select.push(
                r#"min("_offset") AS "window_start", max("_offset") AS "window_end""#.to_string(),
            );
        }

        if self.select.is_empty() {
            self.select.push("*".to_string());
        }

        Ok(())
    }

    // ------------------------------------------------------------------
    // JOIN
    // ------------------------------------------------------------------

    fn compile_join(&mut self, join: &Join) -> Result<(), SemanticError> {
        let jt = match join.join_type {
            JoinType::Inner => "INNER JOIN",
            JoinType::Left => "LEFT JOIN",
            JoinType::Right => "RIGHT JOIN",
            JoinType::Full => "FULL JOIN",
            JoinType::Cross => "CROSS JOIN",
        };
        let safe_table = safe_identifier(&join.table)
            .map_err(|e| SemanticError::Compile(e))?;
        let safe_alias = safe_identifier(&join.alias)
            .map_err(|e| SemanticError::Compile(e))?;
        let safe_left = safe_identifier(&join.on.left_column)
            .map_err(|e| SemanticError::Compile(e))?;
        let safe_right = safe_identifier(&join.on.right_column)
            .map_err(|e| SemanticError::Compile(e))?;
        self.joins.push(format!(
            "{jt} {safe_table} AS {safe_alias} ON {safe_left} = {safe_alias}.{safe_right}",
        ));
        Ok(())
    }

    // ------------------------------------------------------------------
    // WHERE — standard filters
    // ------------------------------------------------------------------

    fn compile_filter(&mut self, filter: &Filter) -> Result<(), SemanticError> {
        let safe_col = safe_identifier(&filter.column)
            .map_err(|e| SemanticError::Compile(e))?;
        let col = if let Some(alias) = &filter.table_alias {
            let safe_alias = safe_identifier(alias)
                .map_err(|e| SemanticError::Compile(e))?;
            format!("{safe_alias}.{safe_col}")
        } else {
            safe_col
        };

        let clause = match &filter.operator {
            FilterOperator::Eq => {
                let p = self.next_param();
                self.params.push(filter_literal(&filter.value));
                format!("{col} = {p}")
            }
            FilterOperator::Ne => {
                let p = self.next_param();
                self.params.push(filter_literal(&filter.value));
                format!("{col} != {p}")
            }
            FilterOperator::Gt => {
                let p = self.next_param();
                self.params.push(filter_literal(&filter.value));
                format!("{col} > {p}")
            }
            FilterOperator::Gte => {
                let p = self.next_param();
                self.params.push(filter_literal(&filter.value));
                format!("{col} >= {p}")
            }
            FilterOperator::Lt => {
                let p = self.next_param();
                self.params.push(filter_literal(&filter.value));
                format!("{col} < {p}")
            }
            FilterOperator::Lte => {
                let p = self.next_param();
                self.params.push(filter_literal(&filter.value));
                format!("{col} <= {p}")
            }
            FilterOperator::Like => {
                let p = self.next_param();
                self.params.push(filter_literal(&filter.value));
                format!("{col} LIKE {p}")
            }
            FilterOperator::NotLike => {
                let p = self.next_param();
                self.params.push(filter_literal(&filter.value));
                format!("{col} NOT LIKE {p}")
            }
            FilterOperator::In => {
                if let FilterValue::List(values) = &filter.value {
                    let params: Vec<String> = values
                        .iter()
                        .map(|v| {
                            let p = self.next_param();
                            self.params.push(v.to_string());
                            p
                        })
                        .collect();
                    format!("{col} IN ({})", params.join(", "))
                } else {
                    return Err(SemanticError::Compile(
                        "IN operator requires a list of values".to_string(),
                    ));
                }
            }
            FilterOperator::NotIn => {
                if let FilterValue::List(values) = &filter.value {
                    let params: Vec<String> = values
                        .iter()
                        .map(|v| {
                            let p = self.next_param();
                            self.params.push(v.to_string());
                            p
                        })
                        .collect();
                    format!("{col} NOT IN ({})", params.join(", "))
                } else {
                    return Err(SemanticError::Compile(
                        "NOT IN operator requires a list of values".to_string(),
                    ));
                }
            }
            FilterOperator::IsNull => format!("{col} IS NULL"),
            FilterOperator::IsNotNull => format!("{col} IS NOT NULL"),
            FilterOperator::Between => {
                if let FilterValue::List(values) = &filter.value {
                    if values.len() != 2 {
                        return Err(SemanticError::Compile(
                            "BETWEEN requires exactly 2 values".to_string(),
                        ));
                    }
                    let p1 = self.next_param();
                    self.params.push(values[0].to_string());
                    let p2 = self.next_param();
                    self.params.push(values[1].to_string());
                    format!("{col} BETWEEN {p1} AND {p2}")
                } else {
                    return Err(SemanticError::Compile(
                        "BETWEEN requires a list of 2 values".to_string(),
                    ));
                }
            }
        };

        self.where_clauses.push(clause);
        Ok(())
    }

    // ------------------------------------------------------------------
    // WHERE — spatial filters (Meridian)
    // ------------------------------------------------------------------

    fn compile_spatial_filter(&mut self, sf: &SpatialFilter) -> Result<(), SemanticError> {
        let col = format!("\"{}\"", sf.column);
        let clause = match &sf.operation {
            SpatialOperation::BoundingBox {
                min_lng,
                min_lat,
                max_lng,
                max_lat,
            } => {
                format!(
                    "ST_Intersects({col}, ST_MakeEnvelope({min_lng}, {min_lat}, {max_lng}, {max_lat}, 4326))"
                )
            }
            SpatialOperation::Radius {
                lng,
                lat,
                radius_meters,
            } => {
                format!(
                    "ST_DWithin({col}::geography, ST_SetSRID(ST_MakePoint({lng}, {lat}), 4326)::geography, {radius_meters})"
                )
            }
            SpatialOperation::ContainsPoint { lng, lat } => {
                format!(
                    "ST_Contains({col}, ST_SetSRID(ST_MakePoint({lng}, {lat}), 4326))"
                )
            }
        };
        self.where_clauses.push(clause);
        Ok(())
    }

    // ------------------------------------------------------------------
    // WHERE — JSON path filters (Canopy)
    // ------------------------------------------------------------------

    fn compile_json_path_filter(&mut self, jpf: &JsonPathFilter) -> Result<(), SemanticError> {
        let col = format!("\"{}\"", jpf.column);
        let path = &jpf.path;
        let clause = match jpf.operator {
            JsonPathOperator::Contains => {
                let p = self.next_param();
                self.params.push(jpf.value.to_string());
                format!("{col} @> '{path}'::jsonb AND {col} @> {p}::jsonb")
            }
            JsonPathOperator::Equals => {
                let p = self.next_param();
                self.params.push(jpf.value.to_string());
                format!("{col} -> '{path}' = {p}::jsonb")
            }
            JsonPathOperator::GreaterThan => {
                let p = self.next_param();
                self.params.push(jpf.value.to_string());
                format!("{col} ->> '{path}' > {p}")
            }
            JsonPathOperator::LessThan => {
                let p = self.next_param();
                self.params.push(jpf.value.to_string());
                format!("{col} ->> '{path}' < {p}")
            }
            JsonPathOperator::Exists => {
                format!("EXISTS (SELECT 1 FROM jsonb_array_elements({col} -> '{path}') AS elem)")
            }
        };
        self.where_clauses.push(clause);
        Ok(())
    }

    // ------------------------------------------------------------------
    // WHERE — graph pattern (Plexus)
    // ------------------------------------------------------------------

    fn compile_graph_pattern(&mut self, gp: &GraphPattern) -> Result<(), SemanticError> {
        // Graph patterns are passed through as a Cypher-like clause.
        // Keystone's Plexus extension interprets MATCH at the SQL level.
        // Validate the pattern to prevent SQL injection.
        let pattern = validate_graph_pattern(&gp.pattern)
            .map_err(|e| SemanticError::Compile(e))?;
        let mut clause = format!("MATCH {pattern}");
        if let Some(w) = &gp.where_clause {
            let where_validated = validate_graph_pattern(w)
                .map_err(|e| SemanticError::Compile(format!("invalid where clause: {e}")))?;
            clause.push_str(&format!(" WHERE {where_validated}"));
        }
        self.where_clauses.push(clause);
        Ok(())
    }

    // ------------------------------------------------------------------
    // GROUP BY
    // ------------------------------------------------------------------

    fn compile_group_by(&mut self) -> Result<(), SemanticError> {
        // Time bucket auto-groups by the bucket expression.
        if self.request.time_bucket.is_some() {
            self.group_by.push("\"time_bucket\"".to_string());
        }

        for dim in &self.request.dimensions {
            let col = if let Some(alias) = &dim.table_alias {
                format!("\"{}\".\"{}\"", alias, dim.column)
            } else {
                format!("\"{}\"", dim.column)
            };
            self.group_by.push(col);
        }

        Ok(())
    }

    // ------------------------------------------------------------------
    // ORDER BY
    // ------------------------------------------------------------------

    fn compile_order_by(&mut self) -> Result<(), SemanticError> {
        // Vector search default: sort by similarity.
        if self.request.vector_search.is_some() && self.request.order_by.is_empty() {
            self.order_by.push("\"_similarity\" ASC".to_string());
        }

        for ob in &self.request.order_by {
            let dir = match ob.direction {
                SortDirection::Asc => "ASC",
                SortDirection::Desc => "DESC",
            };
            self.order_by.push(format!("\"{}\" {dir}", ob.column));
        }

        Ok(())
    }

    // ------------------------------------------------------------------
    // Assembly
    // ------------------------------------------------------------------

    fn assemble_sql(&mut self) -> Result<(), SemanticError> {
        let mut sql = String::new();

        // SELECT
        sql.push_str("SELECT ");
        sql.push_str(&self.select.join(", "));

        // FROM
        sql.push_str(&format!(" FROM {}", self.from_clause));

        // JOINs
        if !self.joins.is_empty() {
            sql.push(' ');
            sql.push_str(&self.joins.join(" "));
        }

        // WHERE
        if !self.where_clauses.is_empty() {
            sql.push_str(" WHERE ");
            sql.push_str(&self.where_clauses.join(" AND "));
        }

        // GROUP BY
        if !self.group_by.is_empty() {
            sql.push_str(" GROUP BY ");
            sql.push_str(&self.group_by.join(", "));
        }

        // ORDER BY
        if !self.order_by.is_empty() {
            sql.push_str(" ORDER BY ");
            sql.push_str(&self.order_by.join(", "));
        }

        // LIMIT
        if let Some(limit) = self.limit {
            sql.push_str(&format!(" LIMIT {limit}"));
        }

        // OFFSET
        if let Some(offset) = self.offset {
            sql.push_str(&format!(" OFFSET {offset}"));
        }

        self.sql = sql;
        Ok(())
    }
}

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

fn filter_literal(value: &FilterValue) -> String {
    match value {
        FilterValue::Literal(v) => v.to_string(),
        FilterValue::List(_) => unreachable!("list literals handled by caller"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_simple_select() {
        let req = QueryRequest {
            source: "orders".to_string(),
            dimensions: vec![Dimension {
                name: "region".to_string(),
                column: "region".to_string(),
                table_alias: None,
            }],
            metrics: vec![Metric {
                name: "total".to_string(),
                expression: "SUM(amount)".to_string(),
                aggregation: Some(Aggregation::Sum),
            }],
            ..Default::default()
        };
        let compiled = compile(&req).unwrap();
        assert!(compiled.sql.contains("SELECT"));
        assert!(compiled.sql.contains("\"region\" AS \"region\""));
        assert!(compiled.sql.contains("(SUM(amount)) AS \"total\""));
        assert!(compiled.sql.contains("FROM \"orders\""));
        assert!(compiled.sql.contains("GROUP BY"));
    }

    #[test]
    fn test_filter() {
        let req = QueryRequest {
            source: "orders".to_string(),
            filters: vec![Filter {
                column: "status".to_string(),
                operator: FilterOperator::Eq,
                value: FilterValue::Literal(serde_json::json!("active")),
                table_alias: None,
            }],
            ..Default::default()
        };
        let compiled = compile(&req).unwrap();
        assert!(compiled.sql.contains("WHERE"));
        assert!(compiled.sql.contains("= $1"));
    }

    #[test]
    fn test_spatial_radius() {
        let req = QueryRequest {
            source: "stores".to_string(),
            spatial_filters: vec![SpatialFilter {
                column: "location".to_string(),
                operation: SpatialOperation::Radius {
                    lng: -73.9857,
                    lat: 40.7484,
                    radius_meters: 1000.0,
                },
            }],
            ..Default::default()
        };
        let compiled = compile(&req).unwrap();
        assert!(compiled.sql.contains("ST_DWithin"));
        assert!(compiled.sql.contains("ST_MakePoint"));
    }

    #[test]
    fn test_vector_search() {
        let req = QueryRequest {
            source: "embeddings".to_string(),
            vector_search: Some(VectorSearch {
                column: "embedding".to_string(),
                reference_vector: vec![0.1, 0.2, 0.3],
                top_k: 5,
                metric: SimilarityMetric::Cosine,
            }),
            ..Default::default()
        };
        let compiled = compile(&req).unwrap();
        assert!(compiled.sql.contains("cosine_distance"));
        assert!(compiled.sql.contains("_similarity"));
    }

    #[test]
    fn test_time_bucket() {
        let req = QueryRequest {
            source: "events".to_string(),
            time_bucket: Some(TimeBucket {
                time_column: "created_at".to_string(),
                interval: TimeInterval::Hour,
            }),
            metrics: vec![Metric::aggregated(
                "count",
                Aggregation::Count,
                "*",
            )],
            ..Default::default()
        };
        let compiled = compile(&req).unwrap();
        assert!(compiled.sql.contains("date_trunc('hour'"));
        assert!(compiled.sql.contains("time_bucket"));
    }

    #[test]
    fn test_json_path_filter() {
        let req = QueryRequest {
            source: "documents".to_string(),
            json_path_filters: vec![JsonPathFilter {
                column: "metadata".to_string(),
                path: "tags".to_string(),
                operator: JsonPathOperator::Contains,
                value: serde_json::json!({"important": true}),
            }],
            ..Default::default()
        };
        let compiled = compile(&req).unwrap();
        assert!(compiled.sql.contains("@>"));
    }

    #[test]
    fn test_empty_source_errors() {
        let req = QueryRequest {
            source: "".to_string(),
            ..Default::default()
        };
        assert!(compile(&req).is_err());
    }

    #[test]
    fn test_join() {
        let req = QueryRequest {
            source: "orders".to_string(),
            dimensions: vec![Dimension {
                name: "customer_name".to_string(),
                column: "name".to_string(),
                table_alias: Some("c".to_string()),
            }],
            joins: vec![Join {
                table: "customers".to_string(),
                alias: "c".to_string(),
                on: JoinCondition {
                    left_column: "customer_id".to_string(),
                    right_column: "id".to_string(),
                },
                join_type: JoinType::Inner,
            }],
            ..Default::default()
        };
        let compiled = compile(&req).unwrap();
        assert!(compiled.sql.contains("INNER JOIN"));
        assert!(compiled.sql.contains("AS \"c\""));
    }
}
