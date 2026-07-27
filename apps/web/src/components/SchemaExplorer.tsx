// SPDX-License-Identifier: MIT OR Apache-2.0
import { useState } from "react";
import type { TableSchema, ColumnSchema } from "../types";

interface SchemaExplorerProps {
  tables: TableSchema[];
  selectedTable: string;
  onSelectTable: (table: TableSchema) => void;
  onSelectColumn: (column: ColumnSchema, table: TableSchema | undefined) => void;
}

export function SchemaExplorer({
  tables,
  selectedTable,
  onSelectTable,
  onSelectColumn,
}: SchemaExplorerProps) {
  const [search, setSearch] = useState("");
  const [expandedTable, setExpandedTable] = useState<string | null>(null);

  const filtered = tables.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div style={{ padding: "0.75rem" }}>
      <h2 style={{ margin: "0 0 0.5rem", fontSize: "0.9rem", color: "#8b949e" }}>
        Schema Explorer
      </h2>
      <input
        type="text"
        placeholder="Search tables..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{
          width: "100%",
          padding: "0.4rem 0.6rem",
          background: "#0d1117",
          border: "1px solid #30363d",
          borderRadius: 4,
          color: "#c9d1d9",
          fontSize: "0.85rem",
          marginBottom: "0.75rem",
          boxSizing: "border-box",
        }}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {filtered.map((table) => {
          const isSelected = table.name === selectedTable;
          const isExpanded = expandedTable === table.name;
          const extBadge = table.extension_indexes.length > 0
            ? table.extension_indexes[0].extension
            : null;

          return (
            <div key={table.name}>
              <div
                onClick={() => {
                  onSelectTable(table);
                  setExpandedTable(isExpanded ? null : table.name);
                }}
                style={{
                  padding: "0.4rem 0.6rem",
                  background: isSelected ? "#1f6feb22" : isExpanded ? "#1f2937" : "transparent",
                  border: isSelected ? "1px solid #1f6feb" : "1px solid transparent",
                  borderRadius: 4,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  fontSize: "0.85rem",
                }}
              >
                <span style={{ color: isSelected ? "#58a6ff" : "#c9d1d9", flex: 1 }}>
                  {table.name}
                </span>
                {extBadge && (
                  <span
                    style={{
                      fontSize: "0.65rem",
                      padding: "0.1rem 0.3rem",
                      background: "#1f6feb33",
                      borderRadius: 3,
                      color: "#58a6ff",
                    }}
                  >
                    {extBadge}
                  </span>
                )}
                {table.is_flux && (
                  <span
                    style={{
                      fontSize: "0.65rem",
                      padding: "0.1rem 0.3rem",
                      background: "#3fb95033",
                      borderRadius: 3,
                      color: "#3fb950",
                    }}
                  >
                    flux
                  </span>
                )}
              </div>
              {isExpanded && (
                <div style={{ paddingLeft: "1rem", paddingBottom: "0.5rem" }}>
                  {table.columns.map((col) => (
                    <div
                      key={col.name}
                      onClick={() => onSelectColumn(col, table)}
                      style={{
                        padding: "0.2rem 0.4rem",
                        fontSize: "0.78rem",
                        color: "#8b949e",
                        cursor: "pointer",
                        borderRadius: 3,
                        display: "flex",
                        gap: "0.5rem",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "#30363d";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent";
                      }}
                    >
                      <span style={{ color: "#c9d1d9", flex: 1 }}>{col.name}</span>
                      <span style={{ color: "#484f58", fontSize: "0.7rem" }}>
                        {col.data_type}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p style={{ fontSize: "0.8rem", color: "#484f58", textAlign: "center", padding: "2rem" }}>
            No tables found
          </p>
        )}
      </div>
    </div>
  );
}
