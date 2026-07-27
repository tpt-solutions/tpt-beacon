// SPDX-License-Identifier: MIT OR Apache-2.0
/**
 * TypeScript types matching the beacon-semantic AST.
 */

export type Aggregation = "count" | "count_distinct" | "sum" | "avg" | "min" | "max";

export interface Metric {
  name: string;
  expression: string;
  aggregation?: Aggregation;
}

export interface Dimension {
  name: string;
  column: string;
  table_alias?: string;
}

export type DataModelExtension =
  | "meridian"
  | "prism"
  | "plexus"
  | "chronos"
  | "canopy"
  | "flux"
  | "standard";

export interface DataSource {
  name: string;
  table: string;
  extension?: DataModelExtension;
}

export type FilterOperator =
  | "eq"
  | "ne"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "like"
  | "not_like"
  | "in"
  | "not_in"
  | "is_null"
  | "is_not_null"
  | "between";

export interface Filter {
  column: string;
  operator: FilterOperator;
  value: unknown;
  table_alias?: string;
}

export type JoinType = "inner" | "left" | "right" | "full" | "cross";

export interface JoinCondition {
  left_column: string;
  right_column: string;
}

export interface Join {
  table: string;
  alias: string;
  on: JoinCondition;
  join_type: JoinType;
}

export interface OrderBy {
  column: string;
  direction: "asc" | "desc";
}

export type SpatialOperation =
  | { BoundingBox: { min_lng: number; min_lat: number; max_lng: number; max_lat: number } }
  | { Radius: { lng: number; lat: number; radius_meters: number } }
  | { ContainsPoint: { lng: number; lat: number } };

export interface SpatialFilter {
  column: string;
  operation: SpatialOperation;
}

export interface VectorSearch {
  column: string;
  reference_vector: number[];
  top_k: number;
  metric: "l2" | "cosine" | "inner_product";
}

export type TimeInterval =
  | "second"
  | "minute"
  | "hour"
  | "day"
  | "week"
  | "month"
  | "quarter"
  | "year"
  | { custom: string };

export interface TimeBucket {
  time_column: string;
  interval: TimeInterval;
}

export interface MovingAverage {
  column: string;
  window_size: number;
  order_by?: string;
}

export interface GraphPattern {
  pattern: string;
  where_clause?: string;
  limit?: number;
}

export type JsonPathOperator = "contains" | "equals" | "greater_than" | "less_than" | "exists";

export interface JsonPathFilter {
  column: string;
  path: string;
  operator: JsonPathOperator;
  value: unknown;
}

export interface StreamWindow {
  size_seconds: number;
  slide_seconds?: number;
  consumer_group?: string;
}

export interface QueryRequest {
  source: string;
  dimensions: Dimension[];
  metrics: Metric[];
  filters: Filter[];
  joins: Join[];
  order_by: OrderBy[];
  limit?: number;
  offset?: number;
  spatial_filters: SpatialFilter[];
  vector_search?: VectorSearch;
  time_bucket?: TimeBucket;
  moving_average?: MovingAverage;
  graph_pattern?: GraphPattern;
  json_path_filters: JsonPathFilter[];
  window?: StreamWindow;
}

export interface SavedQuery {
  id: string;
  name: string;
  description?: string;
  definition: QueryRequest;
  tags: string[];
  created_at: string;
  updated_at: string;
  owner_id?: string;
}

export interface CompiledQuery {
  sql: string;
  hash: string;
  cost_tier: "low" | "medium" | "high";
}

// --- Schema introspection types (from beacon-keystone-client) ---

export interface ColumnSchema {
  name: string;
  data_type: string;
  is_nullable: boolean;
  column_default?: string;
  ordinal_position: number;
}

export interface ExtensionIndex {
  index_name: string;
  column_name: string;
  extension: DataModelExtension;
  access_method: string;
}

export interface TableSchema {
  schema: string;
  name: string;
  columns: ColumnSchema[];
  extension_indexes: ExtensionIndex[];
  is_flux: boolean;
}

export interface FluxTable {
  schema: string;
  table: string;
  consumer_groups: string[];
}
