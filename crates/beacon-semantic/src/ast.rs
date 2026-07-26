//! Query-builder AST types.
//!
//! These types represent the structured query-builder request that the UI
//! produces. The compiler translates these into SQL.

use serde::{Deserialize, Serialize};

// ------------------------------------------------------------------
// Core data-model entities
// ------------------------------------------------------------------

/// A measurable quantity (e.g. revenue, count of sessions).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Metric {
    pub name: String,
    /// SQL expression, e.g. `SUM(amount)`, `COUNT(DISTINCT user_id)`.
    pub expression: String,
    /// Optional aggregation type hint for the UI.
    #[serde(default)]
    pub aggregation: Option<Aggregation>,
}

impl Metric {
    pub fn simple(name: &str, column: &str) -> Self {
        Self {
            name: name.to_string(),
            expression: column.to_string(),
            aggregation: None,
        }
    }

    pub fn aggregated(name: &str, aggregation: Aggregation, column: &str) -> Self {
        let expression = match aggregation {
            Aggregation::Count => format!("COUNT({column})"),
            Aggregation::CountDistinct => format!("COUNT(DISTINCT {column})"),
            Aggregation::Sum => format!("SUM({column})"),
            Aggregation::Avg => format!("AVG({column})"),
            Aggregation::Min => format!("MIN({column})"),
            Aggregation::Max => format!("MAX({column})"),
        };
        Self {
            name: name.to_string(),
            expression,
            aggregation: Some(aggregation),
        }
    }
}

/// Aggregation types available in the query builder.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Aggregation {
    Count,
    CountDistinct,
    Sum,
    Avg,
    Min,
    Max,
}

/// A grouping/attribute field (e.g. region, date).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Dimension {
    pub name: String,
    /// The column in the backing table, e.g. `orders.region`.
    pub column: String,
    /// Optional table alias if joined.
    #[serde(default)]
    pub table_alias: Option<String>,
}

/// A backing data source (table or view) in Keystone.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DataSource {
    pub name: String,
    pub table: String,
    /// Which Keystone extension this source uses (if any).
    #[serde(default)]
    pub extension: Option<DataModelExtension>,
}

/// The seven Keystone data-model extensions.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DataModelExtension {
    Meridian,
    Prism,
    Plexus,
    Chronos,
    Canopy,
    Flux,
    Standard,
}

// ------------------------------------------------------------------
// Query AST
// ------------------------------------------------------------------

/// A structured query-builder request — the root of the AST.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct QueryRequest {
    /// The primary data source name (key into the data-source registry).
    pub source: String,
    /// Fields to group by.
    #[serde(default)]
    pub dimensions: Vec<Dimension>,
    /// Metrics to compute.
    #[serde(default)]
    pub metrics: Vec<Metric>,
    /// Filter conditions.
    #[serde(default)]
    pub filters: Vec<Filter>,
    /// Join specifications.
    #[serde(default)]
    pub joins: Vec<Join>,
    /// Sort order.
    #[serde(default)]
    pub order_by: Vec<OrderBy>,
    /// Row limit.
    #[serde(default)]
    pub limit: Option<u64>,
    /// Row offset for pagination.
    #[serde(default)]
    pub offset: Option<u64>,
    // -- Extension-specific fields --

    /// Geospatial filters (Meridian).
    #[serde(default)]
    pub spatial_filters: Vec<SpatialFilter>,
    /// Vector search parameters (Prism).
    #[serde(default)]
    pub vector_search: Option<VectorSearch>,
    /// Time-series bucketing (Chronos).
    #[serde(default)]
    pub time_bucket: Option<TimeBucket>,
    /// Moving average (Chronos).
    #[serde(default)]
    pub moving_average: Option<MovingAverage>,
    /// Graph traversal pattern (Plexus).
    #[serde(default)]
    pub graph_pattern: Option<GraphPattern>,
    /// JSON path filters (Canopy).
    #[serde(default)]
    pub json_path_filters: Vec<JsonPathFilter>,
    /// Streaming window (Flux).
    #[serde(default)]
    pub window: Option<StreamWindow>,
}

/// A single filter condition.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Filter {
    pub column: String,
    pub operator: FilterOperator,
    pub value: FilterValue,
    /// Optional table alias.
    #[serde(default)]
    pub table_alias: Option<String>,
}

/// Supported filter operators.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FilterOperator {
    Eq,
    Ne,
    Gt,
    Gte,
    Lt,
    Lte,
    Like,
    NotLike,
    In,
    NotIn,
    IsNull,
    IsNotNull,
    Between,
}

/// A filter value — either a literal or a parameter reference.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum FilterValue {
    Literal(serde_json::Value),
    List(Vec<serde_json::Value>),
}

/// A join to another table.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Join {
    pub table: String,
    pub alias: String,
    pub on: JoinCondition,
    pub join_type: JoinType,
}

/// Join condition.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JoinCondition {
    pub left_column: String,
    pub right_column: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum JoinType {
    Inner,
    Left,
    Right,
    Full,
    Cross,
}

/// Sort direction.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrderBy {
    pub column: String,
    pub direction: SortDirection,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SortDirection {
    Asc,
    Desc,
}

// ------------------------------------------------------------------
// Extension-specific AST nodes
// ------------------------------------------------------------------

/// Geospatial filter (Meridian).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpatialFilter {
    pub column: String,
    pub operation: SpatialOperation,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SpatialOperation {
    /// Bounding box intersection: ST_Intersects(column, ST_MakeEnvelope(...))
    BoundingBox {
        min_lng: f64,
        min_lat: f64,
        max_lng: f64,
        max_lat: f64,
    },
    /// Distance filter: ST_DWithin(column, ST_MakePoint(...), radius_meters)
    Radius {
        lng: f64,
        lat: f64,
        radius_meters: f64,
    },
    /// Contains point: ST_Contains(column, ST_MakePoint(...))
    ContainsPoint { lng: f64, lat: f64 },
}

/// Vector similarity search (Prism).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VectorSearch {
    pub column: String,
    /// The reference vector for similarity search (as JSON array of floats).
    pub reference_vector: Vec<f64>,
    /// Number of nearest neighbours to return.
    #[serde(default = "default_top_k")]
    pub top_k: u32,
    /// Similarity metric.
    #[serde(default)]
    pub metric: SimilarityMetric,
}

fn default_top_k() -> u32 {
    10
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SimilarityMetric {
    L2,
    #[default]
    Cosine,
    InnerProduct,
}

/// Time-series bucketing (Chronos).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimeBucket {
    pub time_column: String,
    pub interval: TimeInterval,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TimeInterval {
    Second,
    Minute,
    Hour,
    Day,
    Week,
    Month,
    Quarter,
    Year,
    Custom(String),
}

/// Moving average (Chronos).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MovingAverage {
    pub column: String,
    pub window_size: u32,
    #[serde(default)]
    pub order_by: Option<String>,
}

/// Graph traversal pattern (Plexus).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphPattern {
    /// The MATCH pattern, e.g. `(a:User)-[:FRIEND_OF]->(b:User)`.
    pub pattern: String,
    /// Optional WHERE clause for the graph pattern.
    #[serde(default)]
    pub where_clause: Option<String>,
    /// Optional MATCH limit.
    #[serde(default)]
    pub limit: Option<u32>,
}

/// JSON path filter (Canopy).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonPathFilter {
    pub column: String,
    pub path: String,
    pub operator: JsonPathOperator,
    pub value: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum JsonPathOperator {
    /// column @> path ? value
    Contains,
    /// column -> path = value
    Equals,
    /// column -> path > value
    GreaterThan,
    /// column -> path < value
    LessThan,
    /// EXISTS(column #> path)
    Exists,
}

/// Streaming window (Flux).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamWindow {
    /// Window size in seconds.
    pub size_seconds: u64,
    /// Slide interval in seconds (for sliding windows).
    #[serde(default)]
    pub slide_seconds: Option<u64>,
    /// Consumer group name.
    #[serde(default)]
    pub consumer_group: Option<String>,
}

/// A persisted, named query.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SavedQuery {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub definition: QueryRequest,
    /// Tags for categorization.
    #[serde(default)]
    pub tags: Vec<String>,
    /// ISO-8601 creation timestamp.
    pub created_at: String,
    /// ISO-8601 last-modified timestamp.
    pub updated_at: String,
    /// Owner user ID.
    #[serde(default)]
    pub owner_id: Option<String>,
}

/// Compiled SQL output.
#[derive(Debug, Clone)]
pub struct CompiledQuery {
    pub sql: String,
    /// Hash of the query for cache keying.
    pub hash: String,
    /// Estimated cost tier.
    pub cost_tier: CostTier,
}

/// Estimated cost tier for a compiled query.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CostTier {
    /// Simple indexed lookup — cheap.
    Low,
    /// Full table scan or moderate join — moderate cost.
    Medium,
    /// Unbounded scan, large join, or expensive spatial/vector operation.
    High,
}
