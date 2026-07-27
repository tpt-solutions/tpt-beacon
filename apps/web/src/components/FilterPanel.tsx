// SPDX-License-Identifier: MIT OR Apache-2.0
import { useState } from "react";
import type { Filter, FilterOperator, TableSchema } from "../types";

const OPERATORS: { value: FilterOperator; label: string }[] = [
  { value: "eq", label: "=" },
  { value: "ne", label: "!=" },
  { value: "gt", label: ">" },
  { value: "gte", label: ">=" },
  { value: "lt", label: "<" },
  { value: "lte", label: "<=" },
  { value: "like", label: "LIKE" },
  { value: "not_like", label: "NOT LIKE" },
  { value: "in", label: "IN" },
  { value: "not_in", label: "NOT IN" },
  { value: "is_null", label: "IS NULL" },
  { value: "is_not_null", label: "IS NOT NULL" },
  { value: "between", label: "BETWEEN" },
];

interface FilterPanelProps {
  table: TableSchema;
  filters: Filter[];
  onAddFilter: (filter: Filter) => void;
  onRemoveFilter: (index: number) => void;
}

export function FilterPanel({ table, filters, onAddFilter, onRemoveFilter }: FilterPanelProps) {
  const [column, setColumn] = useState(table.columns[0]?.name ?? "");
  const [operator, setOperator] = useState<FilterOperator>("eq");
  const [value, setValue] = useState("");

  const needsValue = !["is_null", "is_not_null"].includes(operator);

  const handleAdd = () => {
    if (!column) return;
    const filterValue: string | string[] = operator === "in" || operator === "not_in"
      ? value.split(",").map((v) => v.trim())
      : operator === "between"
        ? value.split(",").map((v) => v.trim())
        : value;

    onAddFilter({
      column,
      operator,
      value: filterValue,
    });
    setValue("");
  };

  return (
    <div
      style={{
        background: "#161b22",
        border: "1px solid #30363d",
        borderRadius: 6,
        padding: "0.75rem",
      }}
    >
      <h3 style={{ margin: "0 0 0.5rem", fontSize: "0.85rem", color: "#8b949e" }}>Filters</h3>
      {/* Existing filters */}
      {filters.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem", marginBottom: "0.5rem" }}>
          {filters.map((f, i) => (
            <div
              key={`${f.column}-${i}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
                padding: "0.25rem 0.5rem",
                background: "#0d1117",
                borderRadius: 4,
                fontSize: "0.8rem",
              }}
            >
              <span style={{ color: "#58a6ff" }}>{f.column}</span>
              <span style={{ color: "#8b949e" }}>{f.operator}</span>
              <span style={{ color: "#c9d1d9" }}>
                {Array.isArray(f.value) ? f.value.join(", ") : String(f.value)}
              </span>
              <button
                onClick={() => onRemoveFilter(i)}
                style={{
                  marginLeft: "auto",
                  background: "none",
                  border: "none",
                  color: "#f85149",
                  cursor: "pointer",
                  fontSize: "0.75rem",
                  padding: 0,
                }}
              >
                x
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add filter form */}
      <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", flexWrap: "wrap" }}>
        <select
          value={column}
          onChange={(e) => setColumn(e.target.value)}
          style={selectStyle}
        >
          {table.columns.map((c) => (
            <option key={c.name} value={c.name}>{c.name}</option>
          ))}
        </select>
        <select
          value={operator}
          onChange={(e) => setOperator(e.target.value as FilterOperator)}
          style={{ ...selectStyle, width: 100 }}
        >
          {OPERATORS.map((op) => (
            <option key={op.value} value={op.value}>{op.label}</option>
          ))}
        </select>
        {needsValue && (
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="value"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd();
            }}
            style={{
              flex: 1,
              minWidth: 100,
              padding: "0.3rem 0.5rem",
              background: "#0d1117",
              border: "1px solid #30363d",
              borderRadius: 4,
              color: "#c9d1d9",
              fontSize: "0.8rem",
            }}
          />
        )}
        <button
          onClick={handleAdd}
          style={{
            padding: "0.3rem 0.6rem",
            background: "#30363d",
            border: "1px solid #484f58",
            borderRadius: 4,
            color: "#c9d1d9",
            cursor: "pointer",
            fontSize: "0.8rem",
          }}
        >
          + Add
        </button>
      </div>
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 100,
  padding: "0.3rem",
  background: "#0d1117",
  border: "1px solid #30363d",
  borderRadius: 4,
  color: "#c9d1d9",
  fontSize: "0.8rem",
};
