// SPDX-License-Identifier: MIT OR Apache-2.0
/**
 * Dashboard dependency graph.
 *
 * Extracts which queries and tables each dashboard widget depends on,
 * and builds a dependency graph (nodes + edges) for visualization.
 */

import type { Dashboard } from "./types";

/** A node in the dependency graph. */
export interface DepNode {
  id: string;
  label: string;
  type: "dashboard" | "widget" | "query" | "table";
}

/** An edge in the dependency graph. */
export interface DepEdge {
  from: string;
  to: string;
  label?: string;
}

/** The full dependency graph for a dashboard. */
export interface DependencyGraph {
  nodes: DepNode[];
  edges: DepEdge[];
}

/**
 * Extract table names from a query source string.
 * Handles simple table names and "schema.table" patterns.
 */
function extractTables(source?: string): string[] {
  if (!source) return [];
  // Handle comma-separated sources.
  return source
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Build a dependency graph from a dashboard.
 *
 * Nodes:
 *   - Dashboard (root)
 *   - One node per widget
 *   - One node per unique table referenced
 *
 * Edges:
 *   - dashboard -> widget
 *   - widget -> table
 */
export function buildDependencyGraph(dashboard: Dashboard): DependencyGraph {
  const nodes: DepNode[] = [];
  const edges: DepEdge[] = [];
  const seenTables = new Set<string>();

  // Root dashboard node.
  nodes.push({
    id: `dash:${dashboard.id}`,
    label: dashboard.name,
    type: "dashboard",
  });

  for (const widget of dashboard.widgets) {
    const widgetNodeId = `widget:${widget.id}`;

    // Widget node.
    nodes.push({
      id: widgetNodeId,
      label: widget.title || widget.type,
      type: "widget",
    });

    // Edge: dashboard -> widget.
    edges.push({
      from: `dash:${dashboard.id}`,
      to: widgetNodeId,
    });

    // Extract table dependencies from the widget's query.
    if (widget.query) {
      const tables = extractTables(widget.query.source);
      for (const table of tables) {
        const tableNodeId = `table:${table}`;
        if (!seenTables.has(table)) {
          seenTables.add(table);
          nodes.push({
            id: tableNodeId,
            label: table,
            type: "table",
          });
        }
        edges.push({
          from: widgetNodeId,
          to: tableNodeId,
          label: "queries",
        });
      }

      // Also track joined tables.
      if (widget.query.joins) {
        for (const join of widget.query.joins) {
          const joinTable = join.table;
          const joinNodeId = `table:${joinTable}`;
          if (!seenTables.has(joinTable)) {
            seenTables.add(joinTable);
            nodes.push({
              id: joinNodeId,
              label: joinTable,
              type: "table",
            });
          }
          edges.push({
            from: widgetNodeId,
            to: joinNodeId,
            label: "joins",
          });
        }
      }
    }
  }

  return { nodes, edges };
}
