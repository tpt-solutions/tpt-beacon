// SPDX-License-Identifier: MIT OR Apache-2.0
import type { Dashboard, WidgetType } from "../dashboard/types";

interface DashboardToolbarProps {
  dashboard: Dashboard;
  onAddWidget: (type: WidgetType) => void;
  onAddFilter: () => void;
}

const WIDGET_TYPES: { type: WidgetType; label: string }[] = [
  { type: "bar_chart", label: "Bar Chart" },
  { type: "line_chart", label: "Line Chart" },
  { type: "pie_chart", label: "Pie Chart" },
  { type: "scatter_chart", label: "Scatter" },
  { type: "area_chart", label: "Area Chart" },
  { type: "heatmap", label: "Heatmap" },
  { type: "table", label: "Table" },
  { type: "kpi", label: "KPI Card" },
];

export function DashboardToolbar({ onAddWidget, onAddFilter }: DashboardToolbarProps) {
  return (
    <div
      style={{
        padding: "0.5rem 1rem",
        borderBottom: "1px solid #30363d",
        display: "flex",
        alignItems: "center",
        gap: "0.4rem",
        background: "#161b22",
        flexWrap: "wrap",
      }}
    >
      <span style={{ fontSize: "0.8rem", color: "#8b949e", marginRight: "0.3rem" }}>
        Add widget:
      </span>
      {WIDGET_TYPES.map((wt) => (
        <button
          key={wt.type}
          onClick={() => onAddWidget(wt.type)}
          style={{
            padding: "0.25rem 0.5rem",
            background: "#0d1117",
            border: "1px solid #30363d",
            borderRadius: 4,
            color: "#c9d1d9",
            cursor: "pointer",
            fontSize: "0.75rem",
          }}
        >
          {wt.label}
        </button>
      ))}
      <div style={{ width: 1, height: 20, background: "#30363d", margin: "0 0.3rem" }} />
      <button
        onClick={onAddFilter}
        style={{
          padding: "0.25rem 0.5rem",
          background: "#0d1117",
          border: "1px solid #1f6feb",
          borderRadius: 4,
          color: "#58a6ff",
          cursor: "pointer",
          fontSize: "0.75rem",
        }}
      >
        + Add Filter
      </button>
    </div>
  );
}
