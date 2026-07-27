// SPDX-License-Identifier: MIT OR Apache-2.0
/**
 * Embed page — renders inside an iframe for white-label embedding.
 * Validates embed tokens, supports theme and filter postMessage updates.
 */

import { useState, useEffect, useCallback } from "react";
import { DashboardCanvas } from "../components/DashboardCanvas";
import { DashboardFilterBar } from "../components/DashboardFilterBar";
import type { Dashboard, DashboardFilter } from "../dashboard/types";
import { validateEmbedToken, type EmbedValidation } from "../embed/api";

export function EmbedPage() {
  const params = new URLSearchParams(window.location.search);
  const tokenId = params.get("token");
  const dashboardId = params.get("dashboard");
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [theme, setTheme] = useState<Record<string, string>>({});
  const [_rowFilter, setRowFilter] = useState<Record<string, unknown>>({});
  const [validation, setValidation] = useState<EmbedValidation | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Validate embed token.
  useEffect(() => {
    if (!tokenId) {
      setError("No embed token provided");
      return;
    }
    validateEmbedToken(tokenId).then((v) => {
      if (!v || !v.valid) {
        setError("Invalid or expired embed token");
        return;
      }
      setValidation(v);
      if (v.theme) setTheme(v.theme);
      if (v.row_filter) setRowFilter(v.row_filter);
    });
  }, [tokenId]);

  // Load dashboard from localStorage.
  useEffect(() => {
    const did = validation?.dashboard_id ?? dashboardId;
    if (!did) return;

    const stored = localStorage.getItem("beacon_dashboards");
    if (stored) {
      const all: Dashboard[] = JSON.parse(stored);
      const found = all.find((d) => d.id === did);
      if (found) setDashboard(found);
    }
  }, [validation, dashboardId]);

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

  if (error) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          background: "#0d1117",
          color: "#f85149",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {error}
      </div>
    );
  }

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
