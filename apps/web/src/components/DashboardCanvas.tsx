import { useState, useCallback } from "react";
import type { Dashboard, DashboardWidget } from "../dashboard/types";
import { DashboardWidgetRenderer } from "./DashboardWidgetRenderer";

interface DashboardCanvasProps {
  dashboard: Dashboard;
  onUpdateWidgets: (widgets: DashboardWidget[]) => void;
  onRemoveWidget: (widgetId: string) => void;
  realtime?: boolean;
}

export function DashboardCanvas({
  dashboard,
  onUpdateWidgets,
  onRemoveWidget,
  realtime = false,
}: DashboardCanvasProps) {
  const [dragging, setDragging] = useState<string | null>(null);

  const handleDragStart = useCallback((widgetId: string) => {
    setDragging(widgetId);
  }, []);

  const handleDragEnd = useCallback(
    (widgetId: string, x: number, y: number) => {
      setDragging(null);
      const widgets = dashboard.widgets.map((w) =>
        w.id === widgetId
          ? { ...w, position: { ...w.position, x: Math.max(0, x), y: Math.max(0, y) } }
          : w,
      );
      onUpdateWidgets(widgets);
    },
    [dashboard.widgets, onUpdateWidgets],
  );

  const colWidth = 100 / dashboard.columns;

  return (
    <div
      data-dashboard-canvas
      style={{
        position: "relative",
        padding: "1rem",
        minHeight: 600,
      }}
    >
      {dashboard.widgets.length === 0 ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: 400,
            border: "2px dashed #30363d",
            borderRadius: 8,
            color: "#484f58",
          }}
        >
          <p style={{ fontSize: "0.9rem" }}>
            No widgets yet. Use the toolbar above to add charts, tables, and KPI cards.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
          {dashboard.widgets.map((widget) => (
            <div
              key={widget.id}
              draggable
              onDragStart={() => handleDragStart(widget.id)}
              onDragEnd={(e: React.DragEvent<HTMLDivElement>) => {
                const rect = e.currentTarget.closest("[data-dashboard-canvas]")?.getBoundingClientRect();
                if (rect) {
                  const x = Math.floor((e.clientX - rect.left) / (rect.width / dashboard.columns));
                  const y = Math.floor(
                    (e.clientY - rect.top) / dashboard.rowHeight,
                  );
                  handleDragEnd(widget.id, x, y);
                }
              }}
              style={{
                width: `${colWidth * widget.position.w}%`,
                minWidth: 300,
                minHeight: widget.position.h * dashboard.rowHeight,
                border: dragging === widget.id ? "2px solid #58a6ff" : "1px solid #30363d",
                borderRadius: 8,
                background: "#161b22",
                overflow: "hidden",
                cursor: "grab",
                position: "relative",
                flexShrink: 0,
              }}
            >
              {/* Widget header */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "0.4rem 0.6rem",
                  borderBottom: "1px solid #30363d",
                  background: "#1c2129",
                }}
              >
                <span
                  style={{
                    flex: 1,
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    color: "#c9d1d9",
                  }}
                >
                  {widget.title}
                </span>
                <button
                  onClick={() => onRemoveWidget(widget.id)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#f85149",
                    cursor: "pointer",
                    fontSize: "0.75rem",
                    padding: "0 0.3rem",
                  }}
                >
                  x
                </button>
              </div>
              {/* Widget content */}
              <div style={{ padding: "0.5rem", minHeight: widget.position.h * dashboard.rowHeight - 40 }}>
                <DashboardWidgetRenderer widget={widget} realtime={realtime} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
