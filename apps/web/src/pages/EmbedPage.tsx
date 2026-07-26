/**
 * Embed page — renders inside an iframe for white-label embedding.
 * Supports theme and filter postMessage updates.
 */

import { useState, useEffect, useCallback } from "react";
import { DashboardCanvas } from "../components/DashboardCanvas";
import { DashboardFilterBar } from "../components/DashboardFilterBar";
import type { Dashboard, DashboardFilter } from "../dashboard/types";

export function EmbedPage() {
  const params = new URLSearchParams(window.location.search);
  const dashboardId = params.get("dashboard");
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [theme, setTheme] = useState<Record<string, string>>({});
  const [_rowFilter, setRowFilter] = useState<Record<string, unknown>>({});

  // Load dashboard from parent frame or localStorage.
  useEffect(() => {
    if (dashboardId) {
      const stored = localStorage.getItem("beacon_dashboards");
      if (stored) {
        const all: Dashboard[] = JSON.parse(stored);
        const found = all.find((d) => d.id === dashboardId);
        if (found) setDashboard(found);
      }
    }
  }, [dashboardId]);

  // Listen for postMessage updates from parent.
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "beacon:theme") setTheme(e.data.theme);
      if (e.data?.type === "beacon:filter") setRowFilter(e.data.filter);
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  const handleUpdateFilters = useCallback(
    (filters: DashboardFilter[]) => {
      if (dashboard) setDashboard({ ...dashboard, filters });
    },
    [dashboard],
  );

  if (!dashboard) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          background: theme.background ?? "#0d1117",
          color: theme.text ?? "#8b949e",
        }}
      >
        Loading dashboard...
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: theme.background ?? "#0d1117",
        color: theme.text ?? "#c9d1d9",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      {dashboard.filters.length > 0 && (
        <DashboardFilterBar
          filters={dashboard.filters}
          onUpdateFilters={handleUpdateFilters}
        />
      )}
      <DashboardCanvas
        dashboard={dashboard}
        onUpdateWidgets={(widgets) => setDashboard({ ...dashboard, widgets })}
        onRemoveWidget={(id) =>
          setDashboard({
            ...dashboard,
            widgets: dashboard.widgets.filter((w) => w.id !== id),
          })
        }
        realtime={false}
      />
    </div>
  );
}
