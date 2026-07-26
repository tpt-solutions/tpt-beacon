/**
 * API client for beacon-server.
 */

import type {
  CompiledQuery,
  FluxTable,
  QueryRequest,
  SavedQuery,
  TableSchema,
} from "./types";
import { getToken } from "./auth";

const BASE = "/api";

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function jsonFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...authHeaders() },
    ...init,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

// --- Schema ---

export async function fetchTables(): Promise<TableSchema[]> {
  const data = await jsonFetch<{ tables: TableSchema[] }>("/schema/tables");
  return data.tables;
}

export async function fetchColumns(table: string): Promise<{
  table: string;
  columns: TableSchema["columns"];
}> {
  return jsonFetch(`/schema/tables/${encodeURIComponent(table)}/columns`);
}

export async function fetchExtensions(
  table: string,
): Promise<{ table: string; extension_indexes: TableSchema["extension_indexes"] }> {
  return jsonFetch(`/schema/tables/${encodeURIComponent(table)}/extensions`);
}

export async function fetchFluxTables(): Promise<FluxTable[]> {
  const data = await jsonFetch<{ flux_tables: FluxTable[] }>("/schema/flux");
  return data.flux_tables;
}

// --- Query execution ---

export async function executeRawQuery(
  sql: string,
): Promise<{ columns: { name: string; type: string }[]; count: number }> {
  return jsonFetch("/query", {
    method: "POST",
    body: JSON.stringify({ sql }),
  });
}

// --- Health ---

export async function fetchHealth(): Promise<{
  status: string;
  keystone: { version: string };
  anvil: { available: boolean };
}> {
  return jsonFetch("/readyz");
}

// --- Saved queries (Phase 2 placeholder) ---

export async function fetchSavedQueries(): Promise<SavedQuery[]> {
  // Placeholder — will be backed by Keystone storage in a future phase.
  const stored = localStorage.getItem("beacon_saved_queries");
  return stored ? JSON.parse(stored) : [];
}

export async function saveQuery(query: SavedQuery): Promise<SavedQuery> {
  const existing = await fetchSavedQueries();
  const idx = existing.findIndex((q) => q.id === query.id);
  if (idx >= 0) {
    existing[idx] = query;
  } else {
    existing.push(query);
  }
  localStorage.setItem("beacon_saved_queries", JSON.stringify(existing));
  return query;
}

export async function deleteQuery(id: string): Promise<void> {
  const existing = await fetchSavedQueries();
  const filtered = existing.filter((q) => q.id !== id);
  localStorage.setItem("beacon_saved_queries", JSON.stringify(filtered));
}

// --- Compile (client-side mock — real compilation happens server-side) ---

export function compileRequest(_req: QueryRequest): CompiledQuery {
  // In the full implementation this would POST to /api/compile.
  // For now, generate a basic SQL preview from the request.
  const parts: string[] = ["SELECT"];

  const selectCols: string[] = [];
  for (const dim of _req.dimensions) {
    selectCols.push(`"${dim.column}" AS "${dim.name}"`);
  }
  for (const m of _req.metrics) {
    selectCols.push(`(${m.expression}) AS "${m.name}"`);
  }
  if (selectCols.length === 0) selectCols.push("*");
  parts.push(selectCols.join(", "));

  parts.push(`FROM "${_req.source}"`);

  if (_req.filters.length > 0) {
    const whereClauses = _req.filters.map((f) => `"${f.column}" ${f.operator.toUpperCase()} ...`);
    parts.push(`WHERE ${whereClauses.join(" AND ")}`);
  }

  if (_req.dimensions.length > 0) {
    parts.push(`GROUP BY ${_req.dimensions.map((d) => `"${d.column}"`).join(", ")}`);
  }

  if (_req.order_by.length > 0) {
    parts.push(
      `ORDER BY ${_req.order_by.map((o) => `"${o.column}" ${o.direction.toUpperCase()}`).join(", ")}`,
    );
  }

  if (_req.limit) parts.push(`LIMIT ${_req.limit}`);
  if (_req.offset) parts.push(`OFFSET ${_req.offset}`);

  return {
    sql: parts.join("\n"),
    hash: "client-preview",
    cost_tier: "low",
  };
}
