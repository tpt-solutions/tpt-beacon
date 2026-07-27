// SPDX-License-Identifier: MIT OR Apache-2.0
import { useState, useEffect, useCallback } from "react";
import type {
  QueryRequest,
  TableSchema,
  Dimension,
  Filter,
  OrderBy,
} from "../types";
import { fetchTables, compileRequest, saveQuery, executeRawQuery } from "../api";
import { nlToQuery, type NlQueryResult } from "../ai";
import { SchemaExplorer } from "../components/SchemaExplorer";
import { FilterPanel } from "../components/FilterPanel";
import { SpatialFilterWidget } from "../components/SpatialFilterWidget";
import { VectorSearchWidget } from "../components/VectorSearchWidget";
import { TimeBucketWidget } from "../components/TimeBucketWidget";
import { SqlPreview } from "../components/SqlPreview";
import { ResultsTable } from "../components/ResultsTable";

const EMPTY_REQUEST: QueryRequest = {
  source: "",
  dimensions: [],
  metrics: [],
  filters: [],
  joins: [],
  order_by: [],
  spatial_filters: [],
  json_path_filters: [],
};

export function QueryBuilderPage() {
  const [tables, setTables] = useState<TableSchema[]>([]);
  const [request, setRequest] = useState<QueryRequest>({ ...EMPTY_REQUEST });
  const [compiled, setCompiled] = useState<ReturnType<typeof compileRequest> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [queryResult, setQueryResult] = useState<{
    columns: { name: string; type: string }[];
    count: number;
  } | null>(null);
  const [nlPrompt, setNlPrompt] = useState("");
  const [nlLoading, setNlLoading] = useState(false);
  const [nlResult, setNlResult] = useState<NlQueryResult | null>(null);

  useEffect(() => {
    fetchTables()
      .then(setTables)
      .catch((err) => setError(err.message));
  }, []);

  // Recompile whenever request changes
  useEffect(() => {
    if (request.source) {
      setCompiled(compileRequest(request));
    }
  }, [request]);

  const selectedTable = tables.find((t) => t.name === request.source);

  const handleSelectTable = useCallback(
    (table: TableSchema) => {
      setRequest((prev) => ({
        ...prev,
        source: table.name,
        dimensions: [],
        metrics: [],
        filters: [],
        joins: [],
        order_by: [],
        spatial_filters: [],
        json_path_filters: [],
      }));
      setQueryResult(null);
    },
    [],
  );

  const handleAddDimension = useCallback((dim: Dimension) => {
    setRequest((prev) => ({
      ...prev,
      dimensions: [...prev.dimensions, dim],
    }));
  }, []);

  const handleRemoveDimension = useCallback((index: number) => {
    setRequest((prev) => ({
      ...prev,
      dimensions: prev.dimensions.filter((_, i) => i !== index),
    }));
  }, []);

  const handleRemoveMetric = useCallback((index: number) => {
    setRequest((prev) => ({
      ...prev,
      metrics: prev.metrics.filter((_, i) => i !== index),
    }));
  }, []);

  const handleAddFilter = useCallback((filter: Filter) => {
    setRequest((prev) => ({
      ...prev,
      filters: [...prev.filters, filter],
    }));
  }, []);

  const handleRemoveFilter = useCallback((index: number) => {
    setRequest((prev) => ({
      ...prev,
      filters: prev.filters.filter((_, i) => i !== index),
    }));
  }, []);

  const handleAddOrderBy = useCallback((ob: OrderBy) => {
    setRequest((prev) => ({
      ...prev,
      order_by: [...prev.order_by, ob],
    }));
  }, []);

  const handleRemoveOrderBy = useCallback((index: number) => {
    setRequest((prev) => ({
      ...prev,
      order_by: prev.order_by.filter((_, i) => i !== index),
    }));
  }, []);

  const handleNlQuery = useCallback(async () => {
    if (!nlPrompt.trim()) return;
    setNlLoading(true);
    setNlResult(null);
    setError(null);
    try {
      const result = await nlToQuery(nlPrompt);
      if (result) {
        setNlResult(result);
      } else {
        setError("AI service unavailable. Try building the query manually.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI request failed");
    } finally {
      setNlLoading(false);
    }
  }, [nlPrompt]);

  const handleRunQuery = useCallback(async () => {
    if (!compiled) return;
    setLoading(true);
    setError(null);
    try {
      const result = await executeRawQuery(compiled.sql);
      setQueryResult(result);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Query failed");
    } finally {
      setLoading(false);
    }
  }, [compiled]);

  const handleSaveQuery = useCallback(() => {
    if (!request.source) return;
    // Simple UUID v4 generator (no external dependency needed).
    const uuid = () =>
      "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
    saveQuery({
      id: uuid(),
      name: `Query on ${request.source}`,
      definition: request,
      tags: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }, [request]);

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      {/* Left panel: Schema Explorer */}
      <div
        style={{
          width: 280,
          borderRight: "1px solid #30363d",
          background: "#161b22",
          overflow: "auto",
          flexShrink: 0,
        }}
      >
        <SchemaExplorer
          tables={tables}
          selectedTable={request.source}
          onSelectTable={handleSelectTable}
          onSelectColumn={(col, table) => {
            if (!table) return;
            handleAddDimension({
              name: col.name,
              column: col.name,
            });
          }}
        />
      </div>

      {/* Center: Query Canvas */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Toolbar */}
        <div
          style={{
            padding: "0.75rem 1rem",
            borderBottom: "1px solid #30363d",
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            background: "#161b22",
          }}
        >
          <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>
            {request.source ? `Query: ${request.source}` : "Select a table to begin"}
          </span>
          <div style={{ flex: 1 }} />
          {request.source && (
            <>
              <button
                onClick={handleRunQuery}
                disabled={loading || !compiled}
                style={{
                  padding: "0.4rem 1rem",
                  background: "#238636",
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  cursor: loading ? "wait" : "pointer",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                }}
              >
                {loading ? "Running..." : "Run Query"}
              </button>
              <button
                onClick={handleSaveQuery}
                style={{
                  padding: "0.4rem 1rem",
                  background: "#30363d",
                  color: "#c9d1d9",
                  border: "1px solid #484f58",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontSize: "0.85rem",
                }}
              >
                Save
              </button>
            </>
          )}
        </div>

        {/* Query configuration area */}
        <div
          style={{
            flex: 1,
            overflow: "auto",
            padding: "1rem",
            display: "flex",
            flexDirection: "column",
            gap: "1rem",
          }}
        >
          {error && (
            <div
              style={{
                padding: "0.75rem 1rem",
                background: "#3d1f1f",
                border: "1px solid #6e3630",
                borderRadius: 6,
                color: "#f85149",
                fontSize: "0.85rem",
              }}
            >
              {error}
            </div>
          )}

          {/* AI Natural Language Query */}
          {!request.source && (
            <div
              style={{
                background: "#161b22",
                border: "1px solid #30363d",
                borderRadius: 6,
                padding: "1rem",
              }}
            >
              <h3 style={{ margin: "0 0 0.5rem", fontSize: "0.85rem", color: "#8b949e" }}>
                Ask a question in plain English
              </h3>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <input
                  type="text"
                  value={nlPrompt}
                  onChange={(e) => setNlPrompt(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleNlQuery()}
                  placeholder='e.g. "Show me total revenue by region for the last 30 days"'
                  style={{
                    flex: 1,
                    padding: "0.5rem 0.75rem",
                    background: "#0d1117",
                    border: "1px solid #30363d",
                    borderRadius: 4,
                    color: "#c9d1d9",
                    fontSize: "0.85rem",
                  }}
                />
                <button
                  onClick={handleNlQuery}
                  disabled={nlLoading || !nlPrompt.trim()}
                  style={{
                    padding: "0.4rem 1rem",
                    background: "#8957e5",
                    color: "#fff",
                    border: "none",
                    borderRadius: 6,
                    cursor: nlLoading ? "wait" : "pointer",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                  }}
                >
                  {nlLoading ? "Thinking..." : "Ask AI"}
                </button>
              </div>
              {nlResult && (
                <div style={{ marginTop: "0.75rem" }}>
                  <p style={{ fontSize: "0.8rem", color: "#8b949e", margin: "0 0 0.5rem" }}>
                    {nlResult.interpretation}
                  </p>
                  <div
                    style={{
                      padding: "0.5rem 0.75rem",
                      background: "#0d1117",
                      border: "1px solid #30363d",
                      borderRadius: 4,
                      fontFamily: "monospace",
                      fontSize: "0.8rem",
                      color: "#7ee787",
                      whiteSpace: "pre-wrap",
                      marginBottom: "0.5rem",
                    }}
                  >
                    {nlResult.sql}
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                    <span
                      style={{
                        fontSize: "0.75rem",
                        padding: "0.15rem 0.4rem",
                        borderRadius: 3,
                        background: nlResult.confidence > 0.7 ? "#1a4b2e" : "#3d2e1a",
                        color: nlResult.confidence > 0.7 ? "#3fb950" : "#d29922",
                      }}
                    >
                      {Math.round(nlResult.confidence * 100)}% confidence
                    </span>
                    <button
                      onClick={() => {
                        // Copy SQL to clipboard for manual use.
                        navigator.clipboard.writeText(nlResult.sql).catch(() => {});
                      }}
                      style={{
                        padding: "0.2rem 0.5rem",
                        background: "#30363d",
                        border: "1px solid #484f58",
                        borderRadius: 4,
                        color: "#c9d1d9",
                        cursor: "pointer",
                        fontSize: "0.75rem",
                      }}
                    >
                      Copy SQL
                    </button>
                  </div>
                  {nlResult.suggestions.length > 0 && (
                    <div style={{ marginTop: "0.5rem" }}>
                      <span style={{ fontSize: "0.75rem", color: "#484f58" }}>
                        Follow-up:
                      </span>
                      {nlResult.suggestions.map((s, i) => (
                        <button
                          key={i}
                          onClick={() => setNlPrompt(s)}
                          style={{
                            display: "block",
                            marginTop: "0.25rem",
                            padding: "0.2rem 0.5rem",
                            background: "none",
                            border: "1px solid #30363d",
                            borderRadius: 4,
                            color: "#58a6ff",
                            cursor: "pointer",
                            fontSize: "0.75rem",
                            textAlign: "left",
                          }}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Dimensions */}
          {request.source && (
            <FieldSection
              title="Dimensions (Group By)"
              fields={request.dimensions.map((d) => d.name)}
              onRemove={handleRemoveDimension}
            />
          )}

          {/* Metrics */}
          {request.source && (
            <FieldSection
              title="Metrics (Aggregates)"
              fields={request.metrics.map((m) => m.name)}
              onRemove={handleRemoveMetric}
            />
          )}

          {/* Filters */}
          {request.source && selectedTable && (
            <FilterPanel
              table={selectedTable}
              filters={request.filters}
              onAddFilter={handleAddFilter}
              onRemoveFilter={handleRemoveFilter}
            />
          )}

          {/* Order By */}
          {request.source && selectedTable && (
            <OrderByPanel
              columns={selectedTable.columns.map((c) => c.name)}
              orderBy={request.order_by}
              onAdd={handleAddOrderBy}
              onRemove={handleRemoveOrderBy}
            />
          )}

          {/* Extension-specific widgets */}
          {selectedTable?.extension_indexes.some((i) => i.extension === "meridian") && (
            <SpatialFilterWidget
              columns={selectedTable.columns.filter((c) => c.data_type === "USER-DEFINED" || c.data_type === "geometry")}
              onAddFilter={(sf) =>
                setRequest((prev) => ({
                  ...prev,
                  spatial_filters: [...prev.spatial_filters, sf],
                }))
              }
            />
          )}

          {selectedTable?.extension_indexes.some((i) => i.extension === "prism") && (
            <VectorSearchWidget
              columns={selectedTable.columns.filter(
                (c) => c.data_type === "USER-DEFINED" || c.data_type === "vector",
              )}
              onSetSearch={(vs) =>
                setRequest((prev) => ({ ...prev, vector_search: vs }))
              }
            />
          )}

          {selectedTable?.extension_indexes.some((i) => i.extension === "chronos") && (
            <TimeBucketWidget
              columns={selectedTable.columns}
              onSetTimeBucket={(tb) =>
                setRequest((prev) => ({ ...prev, time_bucket: tb }))
              }
            />
          )}

          {/* Limit */}
          {request.source && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <label style={{ fontSize: "0.8rem", color: "#8b949e" }}>Limit:</label>
              <input
                type="number"
                value={request.limit ?? ""}
                onChange={(e) =>
                  setRequest((prev) => ({
                    ...prev,
                    limit: e.target.value ? Number(e.target.value) : undefined,
                  }))
                }
                placeholder="No limit"
                style={{
                  width: 120,
                  padding: "0.3rem 0.5rem",
                  background: "#0d1117",
                  border: "1px solid #30363d",
                  borderRadius: 4,
                  color: "#c9d1d9",
                  fontSize: "0.85rem",
                }}
              />
            </div>
          )}

          {/* SQL Preview */}
          {compiled && <SqlPreview sql={compiled.sql} costTier={compiled.cost_tier} />}
        </div>

        {/* Results */}
        {queryResult && (
          <div style={{ borderTop: "1px solid #30363d", maxHeight: "40vh", overflow: "auto" }}>
            <ResultsTable columns={queryResult.columns} rowCount={queryResult.count} />
          </div>
        )}
      </div>
    </div>
  );
}

// --- Sub-components ---

function FieldSection({
  title,
  fields,
  onRemove,
}: {
  title: string;
  fields: string[];
  onRemove: (index: number) => void;
}) {
  return (
    <div
      style={{
        background: "#161b22",
        border: "1px solid #30363d",
        borderRadius: 6,
        padding: "0.75rem",
      }}
    >
      <h3 style={{ margin: "0 0 0.5rem", fontSize: "0.85rem", color: "#8b949e" }}>{title}</h3>
      {fields.length === 0 ? (
        <p style={{ margin: 0, fontSize: "0.8rem", color: "#484f58" }}>
          No fields added yet
        </p>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
          {fields.map((f, i) => (
            <span
              key={`${f}-${i}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.3rem",
                padding: "0.2rem 0.5rem",
                background: "#1f6feb22",
                border: "1px solid #1f6feb",
                borderRadius: 4,
                fontSize: "0.8rem",
                color: "#58a6ff",
              }}
            >
              {f}
              <button
                onClick={() => onRemove(i)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#f85149",
                  cursor: "pointer",
                  fontSize: "0.75rem",
                  padding: 0,
                }}
              >
                x
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function OrderByPanel({
  columns,
  orderBy,
  onAdd,
  onRemove,
}: {
  columns: string[];
  orderBy: OrderBy[];
  onAdd: (ob: OrderBy) => void;
  onRemove: (index: number) => void;
}) {
  const [col, setCol] = useState(columns[0] ?? "");
  const [dir, setDir] = useState<"asc" | "desc">("asc");

  return (
    <div
      style={{
        background: "#161b22",
        border: "1px solid #30363d",
        borderRadius: 6,
        padding: "0.75rem",
      }}
    >
      <h3 style={{ margin: "0 0 0.5rem", fontSize: "0.85rem", color: "#8b949e" }}>Sort By</h3>
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.5rem" }}>
        <select
          value={col}
          onChange={(e) => setCol(e.target.value)}
          style={{
            flex: 1,
            padding: "0.3rem",
            background: "#0d1117",
            border: "1px solid #30363d",
            borderRadius: 4,
            color: "#c9d1d9",
            fontSize: "0.8rem",
          }}
        >
          {columns.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select
          value={dir}
          onChange={(e) => setDir(e.target.value as "asc" | "desc")}
          style={{
            width: 80,
            padding: "0.3rem",
            background: "#0d1117",
            border: "1px solid #30363d",
            borderRadius: 4,
            color: "#c9d1d9",
            fontSize: "0.8rem",
          }}
        >
          <option value="asc">ASC</option>
          <option value="desc">DESC</option>
        </select>
        <button
          onClick={() => {
            if (col) onAdd({ column: col, direction: dir });
          }}
          style={{
            padding: "0.3rem 0.6rem",
            background: "#30363d",
            border: "1px solid #484f58",
            borderRadius: 4,
            color: "#c9d1d9",
            cursor: "pointer",
            fontSize: "0.8rem",
          }}
        >
          + Add
        </button>
      </div>
      {orderBy.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
          {orderBy.map((ob, i) => (
            <span
              key={`${ob.column}-${i}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.3rem",
                padding: "0.2rem 0.5rem",
                background: "#30363d",
                border: "1px solid #484f58",
                borderRadius: 4,
                fontSize: "0.8rem",
                color: "#c9d1d9",
              }}
            >
              {ob.column} {ob.direction.toUpperCase()}
              <button
                onClick={() => onRemove(i)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#f85149",
                  cursor: "pointer",
                  fontSize: "0.75rem",
                  padding: 0,
                }}
              >
                x
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
