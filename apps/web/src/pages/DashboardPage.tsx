// SPDX-License-Identifier: MIT OR Apache-2.0
import { useState, useCallback, useRef } from "react";
import type { Dashboard, DashboardWidget, DashboardFilter } from "../dashboard/types";
import { buildDependencyGraph } from "../dashboard/dependencies";
import { DashboardCanvas } from "../components/DashboardCanvas";
import { DashboardToolbar } from "../components/DashboardToolbar";
import { DashboardFilterBar } from "../components/DashboardFilterBar";
import { DependencyGraph } from "../components/DependencyGraph";
import { ScheduledSnapshots } from "../components/ScheduledSnapshots";
import { exportToPng } from "../dashboard/export";

const STORAGE_KEY = "beacon_dashboards";

function loadDashboards(): Dashboard[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveDashboards(dashboards: Dashboard[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(dashboards));
}

export function DashboardPage() {
  const [dashboards, setDashboards] = useState<Dashboard[]>(loadDashboards);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [realtimeEnabled, setRealtimeEnabled] = useState(true);
  const [revisions, setRevisions] = useState<Record<string, Dashboard[]>>({});
  const [snapshotSchedules, setSnapshotSchedules] = useState<
    Record<string, Array<{ id: string; dashboard_id: string; interval_seconds: number; last_snapshot_at: string | null; enabled: boolean; created_at: string }>>
  >({});
  const [showDeps, setShowDeps] = useState(false);
  const dashboardRef = useRef<HTMLDivElement>(null);

  const dashboard = dashboards.find((d) => d.id === currentId) ?? null;

  const handleSave = useCallback(
    (updated: Dashboard) => {
      const now = new Date().toISOString();
      const withTimestamp = { ...updated, updated_at: now };

      // Store revision.
      const revs = revisions[updated.id] ?? [];
      const nextRevs = {
        ...revisions,
        [updated.id]: [...revs, { ...withTimestamp }],
      };
      setRevisions(nextRevs);

      const idx = dashboards.findIndex((d) => d.id === withTimestamp.id);
      let next: Dashboard[];
      if (idx >= 0) {
        next = [...dashboards];
        next[idx] = withTimestamp;
      } else {
        next = [...dashboards, withTimestamp];
      }
      setDashboards(next);
      saveDashboards(next);
      setCurrentId(withTimestamp.id);
    },
    [dashboards, revisions],
  );

  const handleNew = useCallback(() => {
    const id = crypto.randomUUID?.() ?? Date.now().toString(36);
    const newDash: Dashboard = {
      id,
      name: "New Dashboard",
      widgets: [],
      filters: [],
      columns: 12,
      rowHeight: 80,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      tags: [],
    };
    const next = [...dashboards, newDash];
    setDashboards(next);
    saveDashboards(next);
    setCurrentId(id);
  }, [dashboards]);

  const handleDelete = useCallback(
    (id: string) => {
      const next = dashboards.filter((d) => d.id !== id);
      setDashboards(next);
      saveDashboards(next);
      if (currentId === id) setCurrentId(null);
    },
    [dashboards, currentId],
  );

  const handleUpdateWidgets = useCallback(
    (widgets: DashboardWidget[]) => {
      if (!dashboard) return;
      handleSave({ ...dashboard, widgets });
    },
    [dashboard, handleSave],
  );

  const handleUpdateFilters = useCallback(
    (filters: DashboardFilter[]) => {
      if (!dashboard) return;
      handleSave({ ...dashboard, filters });
    },
    [dashboard, handleSave],
  );

  const handleExportPdf = useCallback(async () => {
    if (!dashboard) return;
    // Use browser's print dialog as a PDF export fallback.
    // A production implementation would use a headless browser or jsPDF.
    window.print();
  }, [dashboard]);

  const handleExportPng = useCallback(async () => {
    if (!dashboard || !dashboardRef.current) return;
    try {
      await exportToPng(dashboardRef.current, `${dashboard.name}.png`);
    } catch (err) {
      console.error("PNG export failed:", err);
    }
  }, [dashboard]);

  const handleCreateSnapshot = useCallback(
    (intervalSeconds: number) => {
      if (!dashboard) return;
      const id = crypto.randomUUID?.() ?? Date.now().toString(36);
      const schedule = {
        id,
        dashboard_id: dashboard.id,
        interval_seconds: intervalSeconds,
        last_snapshot_at: null,
        enabled: true,
        created_at: new Date().toISOString(),
      };
      setSnapshotSchedules((prev) => ({
        ...prev,
        [dashboard.id]: [...(prev[dashboard.id] ?? []), schedule],
      }));
    },
    [dashboard],
  );

  const handleDeleteSnapshot = useCallback(
    (scheduleId: string) => {
      if (!dashboard) return;
      setSnapshotSchedules((prev) => ({
        ...prev,
        [dashboard.id]: (prev[dashboard.id] ?? []).filter((s) => s.id !== scheduleId),
      }));
    },
    [dashboard],
  );

  const handleToggleSnapshot = useCallback(
    (scheduleId: string, enabled: boolean) => {
      if (!dashboard) return;
      setSnapshotSchedules((prev) => ({
        ...prev,
        [dashboard.id]: (prev[dashboard.id] ?? []).map((s) =>
          s.id === scheduleId ? { ...s, enabled } : s,
        ),
      }));
    },
    [dashboard],
  );

  const depGraph = dashboard ? buildDependencyGraph(dashboard) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      {/* Dashboard list / selector */}
      <div
        style={{
          padding: "0.75rem 1rem",
          borderBottom: "1px solid #30363d",
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          background: "#161b22",
        }}
      >
        <span style={{ fontSize: "0.85rem", color: "#8b949e", marginRight: "0.5rem" }}>
          Dashboard:
        </span>
        <select
          value={currentId ?? ""}
          onChange={(e) => setCurrentId(e.target.value || null)}
          style={{
            padding: "0.3rem 0.5rem",
            background: "#0d1117",
            border: "1px solid #30363d",
            borderRadius: 4,
            color: "#c9d1d9",
            fontSize: "0.85rem",
            minWidth: 200,
          }}
        >
          <option value="">Select a dashboard...</option>
          {dashboards.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <button onClick={handleNew} style={btnStyle}>
          + New
        </button>
        {dashboard && (
          <>
            <input
              type="text"
              value={dashboard.name}
              onChange={(e) => handleSave({ ...dashboard, name: e.target.value })}
              style={{
                padding: "0.3rem 0.5rem",
                background: "#0d1117",
                border: "1px solid #30363d",
                borderRadius: 4,
                color: "#c9d1d9",
                fontSize: "0.85rem",
                flex: 1,
                maxWidth: 300,
              }}
            />
            <button onClick={() => handleExportPng()} style={btnStyle}>
              Export PNG
            </button>
            <button onClick={handleExportPdf} style={btnStyle}>
              Export PDF
            </button>
            <button
              onClick={() => setShowDeps((prev) => !prev)}
              style={{
                ...btnStyle,
                background: showDeps ? "#1a3a5e" : "#30363d",
                borderColor: showDeps ? "#58a6ff" : "#484f58",
                color: showDeps ? "#58a6ff" : "#8b949e",
              }}
            >
              {showDeps ? "Hide Deps" : "Deps"}
            </button>
            <button
              onClick={() => setRealtimeEnabled((prev) => !prev)}
              style={{
                ...btnStyle,
                background: realtimeEnabled ? "#1a4b2e" : "#30363d",
                borderColor: realtimeEnabled ? "#3fb950" : "#484f58",
                color: realtimeEnabled ? "#3fb950" : "#8b949e",
              }}
            >
              {realtimeEnabled ? "\u25CF Live" : "\u25CB Polling"}
            </button>
            <button
              onClick={() => handleDelete(dashboard.id)}
              style={{ ...btnStyle, color: "#f85149" }}
            >
              Delete
            </button>
          </>
        )}
      </div>

      {/* Dashboard content */}
      {dashboard ? (
        <div ref={dashboardRef} style={{ flex: 1, overflow: "auto", background: "#0d1117" }}>
          {/* Filter bar */}
          {dashboard.filters.length > 0 && (
            <DashboardFilterBar
              filters={dashboard.filters}
              onUpdateFilters={handleUpdateFilters}
            />
          )}
          {/* Toolbar */}
          <DashboardToolbar
            dashboard={dashboard}
            onAddWidget={(type) => {
              const id = crypto.randomUUID?.() ?? Date.now().toString(36);
              const maxY = dashboard.widgets.reduce(
                (max: number, w: DashboardWidget) => Math.max(max, w.position.y + w.position.h),
                0,
              );
              const newWidget: DashboardWidget = {
                id,
                type,
                title: `New ${type.replace(/_/g, " ")}`,
                position: { x: 0, y: maxY, w: 6, h: 4 },
                config: {},
              };
              handleUpdateWidgets([...dashboard.widgets, newWidget]);
            }}
            onAddFilter={() => {
              const newFilter: DashboardFilter = {
                id: crypto.randomUUID?.() ?? Date.now().toString(36),
                name: "New Filter",
                column: "",
                operator: "eq",
                value: "",
                visible: true,
              };
              handleUpdateFilters([...dashboard.filters, newFilter]);
            }}
          />
          {/* Canvas */}
          <DashboardCanvas
            dashboard={dashboard}
            onUpdateWidgets={handleUpdateWidgets}
            onRemoveWidget={(widgetId) => {
              handleUpdateWidgets(dashboard.widgets.filter((w) => w.id !== widgetId));
            }}
            realtime={realtimeEnabled}
          />
          {/* Version History */}
          {dashboard && revisions[dashboard.id]?.length ? (
            <div
              style={{
                borderTop: "1px solid #30363d",
                padding: "0.75rem 1rem",
                background: "#161b22",
              }}
            >
              <h3 style={{ fontSize: "0.85rem", margin: "0 0 0.5rem", color: "#8b949e" }}>
                Version History ({revisions[dashboard.id].length} revisions)
              </h3>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", maxHeight: 120, overflow: "auto" }}>
                {revisions[dashboard.id].map((rev, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      // Restore this revision.
                      const restored = { ...rev, updated_at: new Date().toISOString() };
                      handleSave(restored);
                    }}
                    style={{
                      background: "#0d1117",
                      border: "1px solid #30363d",
                      borderRadius: 4,
                      color: "#c9d1d9",
                      cursor: "pointer",
                      fontSize: "0.75rem",
                      padding: "0.3rem 0.5rem",
                    }}
                    title={`Restore revision ${i + 1}`}
                  >
                    v{i + 1} — {new Date(rev.updated_at).toLocaleTimeString()}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {/* Dependency Graph */}
          {showDeps && depGraph && (
            <div
              style={{
                borderTop: "1px solid #30363d",
                padding: "0.75rem 1rem",
                background: "#161b22",
              }}
            >
              <h3 style={{ fontSize: "0.85rem", margin: "0 0 0.5rem", color: "#8b949e" }}>
                Dependency Graph
              </h3>
              <DependencyGraph graph={depGraph} width={700} height={350} />
            </div>
          )}
          {/* Scheduled Snapshots */}
          {dashboard && (
            <ScheduledSnapshots
              dashboardId={dashboard.id}
              schedules={snapshotSchedules[dashboard.id] ?? []}
              onCreate={handleCreateSnapshot}
              onDelete={handleDeleteSnapshot}
              onToggle={handleToggleSnapshot}
            />
          )}
        </div>
      ) : (
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#484f58",
          }}
        >
          <div style={{ textAlign: "center" }}>
            <h2 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>No Dashboard Selected</h2>
            <p style={{ fontSize: "0.9rem" }}>Select a dashboard or create a new one.</p>
          </div>
        </div>
      )}
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: "0.3rem 0.6rem",
  background: "#30363d",
  border: "1px solid #484f58",
  borderRadius: 4,
  color: "#c9d1d9",
  cursor: "pointer",
  fontSize: "0.8rem",
  whiteSpace: "nowrap",
};
