// SPDX-License-Identifier: MIT OR Apache-2.0
/**
 * AI layer API client — NL-to-query, suggestions, explanations.
 * Gracefully returns null/empty when Anvil is unavailable (503).
 */

const BASE = "/api/ai";

async function aiFetch<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...init,
    });
    if (res.status === 503) return null; // Anvil unavailable
    if (!res.ok) return null;
    return res.json() as Promise<T>;
  } catch {
    return null;
  }
}

export interface NlQueryResult {
  interpretation: string;
  sql: string;
  confidence: number;
  suggestions: string[];
}

export interface QueryExplanation {
  explanation: string;
  insights: string[];
  chart_recommendation: string | null;
}

export interface QuerySuggestion {
  label: string;
  description: string;
  query_hint: string;
}

/** Convert a natural-language prompt into a SQL query. */
export async function nlToQuery(prompt: string): Promise<NlQueryResult | null> {
  return aiFetch<NlQueryResult>("/nl-to-query", {
    method: "POST",
    body: JSON.stringify({ prompt }),
  });
}

/** Get AI-powered query suggestions based on recent tables. */
export async function getQuerySuggestions(
  recentTables: string[] = [],
): Promise<QuerySuggestion[] | null> {
  const result = await aiFetch<{ suggestions: QuerySuggestion[] }>("/suggest", {
    method: "POST",
    body: JSON.stringify({ recent_tables: recentTables }),
  });
  return result?.suggestions ?? null;
}

/** Explain a query result in natural language. */
export async function explainResult(
  sql: string,
  columns: string[],
  rowCount: number,
): Promise<QueryExplanation | null> {
  return aiFetch<QueryExplanation>("/explain", {
    method: "POST",
    body: JSON.stringify({ sql, columns, row_count: rowCount }),
  });
}
