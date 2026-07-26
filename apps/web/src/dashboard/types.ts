/**
 * Dashboard data model.
 */

import type { QueryRequest, Filter } from "../types";

/** Dashboard layout grid position. */
export interface GridPosition {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Widget types supported on the dashboard. */
export type WidgetType =
  | "bar_chart"
  | "line_chart"
  | "pie_chart"
  | "scatter_chart"
  | "area_chart"
  | "heatmap"
  | "table"
  | "kpi";

/** A single widget on the dashboard. */
export interface DashboardWidget {
  id: string;
  type: WidgetType;
  title: string;
  /** The saved query this widget is bound to. */
  query_id?: string;
  /** Inline query definition (if not referencing a saved query). */
  query?: QueryRequest;
  /** Layout grid position. */
  position: GridPosition;
  /** Widget-specific configuration (chart keys, color overrides, etc.). */
  config: WidgetConfig;
}

/** Widget-specific configuration. */
export interface WidgetConfig {
  /** For charts: which column maps to which axis. */
  xKey?: string;
  yKey?: string;
  yKeys?: string[];
  labelKey?: string;
  valueKey?: string;
  /** Whether a pie chart should be rendered as donut. */
  donut?: boolean;
  /** Custom color overrides. */
  colors?: string[];
  /** KPI-specific: the metric value. */
  kpiValue?: string;
  kpiFormat?: "number" | "currency" | "percent";
  kpiTrend?: "up" | "down" | "flat";
}

/** Shared filter that propagates to all widgets. */
export interface DashboardFilter {
  id: string;
  name: string;
  column: string;
  operator: Filter["operator"];
  value: unknown;
  /** If true, this filter is visible to the user. */
  visible: boolean;
}

/** Dashboard revision history entry. */
export interface DashboardRevision {
  version: number;
  timestamp: string;
  author?: string;
  snapshot: Dashboard;
}

/** A complete dashboard. */
export interface Dashboard {
  id: string;
  name: string;
  description?: string;
  widgets: DashboardWidget[];
  filters: DashboardFilter[];
  /** Grid columns (default 12-column grid). */
  columns: number;
  /** Row height in pixels. */
  rowHeight: number;
  created_at: string;
  updated_at: string;
  owner_id?: string;
  /** Revision history. */
  revisions?: DashboardRevision[];
  /** Tags for categorization. */
  tags: string[];
}

/** Create an empty dashboard. */
export function createEmptyDashboard(): Dashboard {
  return {
    id: crypto.randomUUID?.() ?? Date.now().toString(36),
    name: "Untitled Dashboard",
    widgets: [],
    filters: [],
    columns: 12,
    rowHeight: 80,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    tags: [],
  };
}

/** Create a widget with default position. */
export function createWidget(
  type: WidgetType,
  title: string,
  existingWidgets: DashboardWidget[],
): DashboardWidget {
  // Find next available position.
  const maxY = existingWidgets.reduce(
    (max, w) => Math.max(max, w.position.y + w.position.h),
    0,
  );

  return {
    id: crypto.randomUUID?.() ?? Date.now().toString(36),
    type,
    title,
    position: { x: 0, y: maxY, w: 6, h: 4 },
    config: {},
  };
}
