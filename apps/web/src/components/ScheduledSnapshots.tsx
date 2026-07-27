// SPDX-License-Identifier: MIT OR Apache-2.0
/**
 * ScheduledSnapshots — panel for managing dashboard snapshot schedules.
 *
 * Lists existing schedules and allows creating new ones.
 */

import { useState, useCallback } from "react";

interface SnapshotSchedule {
  id: string;
  dashboard_id: string;
  interval_seconds: number;
  last_snapshot_at: string | null;
  enabled: boolean;
  created_at: string;
}

interface Props {
  dashboardId: string;
  schedules: SnapshotSchedule[];
  onCreate: (intervalSeconds: number) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string, enabled: boolean) => void;
}

function formatInterval(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

const PRESETS = [
  { label: "1 minute", value: 60 },
  { label: "5 minutes", value: 300 },
  { label: "15 minutes", value: 900 },
  { label: "1 hour", value: 3600 },
  { label: "6 hours", value: 21600 },
  { label: "24 hours", value: 86400 },
];

export function ScheduledSnapshots({
  schedules,
  onCreate,
  onDelete,
  onToggle,
}: Props) {
  const [selectedInterval, setSelectedInterval] = useState(300);

  const handleCreate = useCallback(() => {
    onCreate(selectedInterval);
  }, [selectedInterval, onCreate]);

  return (
    <div
      style={{
        borderTop: "1px solid #30363d",
        padding: "0.75rem 1rem",
        background: "#161b22",
      }}
    >
      <h3 style={{ fontSize: "0.85rem", margin: "0 0 0.5rem", color: "#8b949e" }}>
        Scheduled Snapshots ({schedules.length})
      </h3>

      {/* Existing schedules */}
      {schedules.length > 0 && (
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
          {schedules.map((s) => (
            <div
              key={s.id}
              style={{
                background: "#0d1117",
                border: "1px solid #30363d",
                borderRadius: 6,
                padding: "0.4rem 0.6rem",
                fontSize: "0.75rem",
                color: "#c9d1d9",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: s.enabled ? "#3fb950" : "#484f58",
                }}
              />
              Every {formatInterval(s.interval_seconds)}
              {s.last_snapshot_at && (
                <span style={{ color: "#8b949e" }}>
                  (last: {new Date(s.last_snapshot_at).toLocaleTimeString()})
                </span>
              )}
              <button
                onClick={() => onToggle(s.id, !s.enabled)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#58a6ff",
                  cursor: "pointer",
                  padding: 0,
                  fontSize: "0.75rem",
                }}
              >
                {s.enabled ? "pause" : "resume"}
              </button>
              <button
                onClick={() => onDelete(s.id)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#f85149",
                  cursor: "pointer",
                  padding: 0,
                  fontSize: "0.75rem",
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Create new schedule */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
        <select
          value={selectedInterval}
          onChange={(e) => setSelectedInterval(Number(e.target.value))}
          style={{
            padding: "0.3rem 0.5rem",
            background: "#0d1117",
            border: "1px solid #30363d",
            borderRadius: 4,
            color: "#c9d1d9",
            fontSize: "0.8rem",
          }}
        >
          {PRESETS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
        <button
          onClick={handleCreate}
          style={{
            padding: "0.3rem 0.6rem",
            background: "#238636",
            border: "1px solid #2ea043",
            borderRadius: 4,
            color: "#e6edf3",
            cursor: "pointer",
            fontSize: "0.8rem",
          }}
        >
          + Add Schedule
        </button>
      </div>
    </div>
  );
}
