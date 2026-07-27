// SPDX-License-Identifier: MIT OR Apache-2.0
import { useState } from "react";
import type { DashboardFilter } from "../dashboard/types";

interface DashboardFilterBarProps {
  filters: DashboardFilter[];
  onUpdateFilters: (filters: DashboardFilter[]) => void;
}

export function DashboardFilterBar({ filters, onUpdateFilters }: DashboardFilterBarProps) {
  const [editingId, setEditingId] = useState<string | null>(null);

  const visibleFilters = filters.filter((f) => f.visible);

  const handleUpdate = (id: string, updates: Partial<DashboardFilter>) => {
    onUpdateFilters(filters.map((f) => (f.id === id ? { ...f, ...updates } : f)));
  };

  const handleDelete = (id: string) => {
    onUpdateFilters(filters.filter((f) => f.id !== id));
  };

  return (
    <div
      style={{
        padding: "0.5rem 1rem",
        borderBottom: "1px solid #30363d",
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        background: "#1c2129",
        flexWrap: "wrap",
      }}
    >
      <span style={{ fontSize: "0.8rem", color: "#8b949e", fontWeight: 600 }}>
        Filters:
      </span>
      {visibleFilters.map((filter) => (
        <div
          key={filter.id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.3rem",
            padding: "0.2rem 0.5rem",
            background: "#0d1117",
            border: "1px solid #30363d",
            borderRadius: 4,
            fontSize: "0.8rem",
          }}
        >
          <span style={{ color: "#8b949e" }}>{filter.name}:</span>
          <input
            type="text"
            value={String(filter.value)}
            onChange={(e) => handleUpdate(filter.id, { value: e.target.value })}
            style={{
              width: 100,
              padding: "0.15rem 0.3rem",
              background: "#161b22",
              border: "1px solid #30363d",
              borderRadius: 3,
              color: "#c9d1d9",
              fontSize: "0.8rem",
            }}
          />
          <button
            onClick={() => setEditingId(filter.id)}
            style={{
              background: "none",
              border: "none",
              color: "#58a6ff",
              cursor: "pointer",
              fontSize: "0.7rem",
              padding: 0,
            }}
          >
            edit
          </button>
          <button
            onClick={() => handleDelete(filter.id)}
            style={{
              background: "none",
              border: "none",
              color: "#f85149",
              cursor: "pointer",
              fontSize: "0.7rem",
              padding: 0,
            }}
          >
            x
          </button>
        </div>
      ))}

      {/* Edit modal (simplified inline) */}
      {editingId && (
        <FilterEditInline
          filter={filters.find((f) => f.id === editingId)!}
          onUpdate={(updates) => handleUpdate(editingId, updates)}
          onClose={() => setEditingId(null)}
        />
      )}
    </div>
  );
}

function FilterEditInline({
  filter,
  onUpdate,
  onClose,
}: {
  filter: DashboardFilter;
  onUpdate: (updates: Partial<DashboardFilter>) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(filter.name);
  const [column, setColumn] = useState(filter.column);
  const [operator, setOperator] = useState(filter.operator);

  return (
    <div
      style={{
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        background: "#161b22",
        border: "1px solid #30363d",
        borderRadius: 8,
        padding: "1rem",
        zIndex: 100,
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
        minWidth: 300,
      }}
    >
      <h4 style={{ margin: 0, fontSize: "0.9rem" }}>Edit Filter</h4>
      <input
        placeholder="Filter name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        style={inputStyle}
      />
      <input
        placeholder="Column name"
        value={column}
        onChange={(e) => setColumn(e.target.value)}
        style={inputStyle}
      />
      <select value={operator} onChange={(e) => setOperator(e.target.value as DashboardFilter["operator"])} style={inputStyle}>
        <option value="eq">equals</option>
        <option value="ne">not equals</option>
        <option value="like">contains</option>
        <option value="in">in list</option>
      </select>
      <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
        <button onClick={onClose} style={{ ...btnStyle, background: "#30363d" }}>
          Cancel
        </button>
        <button
          onClick={() => {
            onUpdate({ name, column, operator });
            onClose();
          }}
          style={{ ...btnStyle, background: "#238636" }}
        >
          Save
        </button>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "0.3rem 0.5rem",
  background: "#0d1117",
  border: "1px solid #30363d",
  borderRadius: 4,
  color: "#c9d1d9",
  fontSize: "0.85rem",
};

const btnStyle: React.CSSProperties = {
  padding: "0.3rem 0.6rem",
  border: "1px solid #484f58",
  borderRadius: 4,
  color: "#c9d1d9",
  cursor: "pointer",
  fontSize: "0.8rem",
};
