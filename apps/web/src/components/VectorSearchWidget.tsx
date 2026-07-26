import { useState } from "react";
import type { ColumnSchema, VectorSearch } from "../types";

interface VectorSearchWidgetProps {
  columns: ColumnSchema[];
  onSetSearch: (search: VectorSearch) => void;
}

export function VectorSearchWidget({ columns, onSetSearch }: VectorSearchWidgetProps) {
  const [column, setColumn] = useState(columns[0]?.name ?? "");
  const [topK, setTopK] = useState("10");
  const [metric, setMetric] = useState<VectorSearch["metric"]>("cosine");
  const [vectorText, setVectorText] = useState("0.1, 0.2, 0.3");

  const handleApply = () => {
    const reference_vector = vectorText
      .split(",")
      .map((v) => parseFloat(v.trim()))
      .filter((v) => !isNaN(v));
    onSetSearch({
      column,
      reference_vector,
      top_k: parseInt(topK, 10) || 10,
      metric,
    });
  };

  return (
    <div
      style={{
        background: "#161b22",
        border: "1px solid #a371f7",
        borderRadius: 6,
        padding: "0.75rem",
      }}
    >
      <h3
        style={{
          margin: "0 0 0.5rem",
          fontSize: "0.85rem",
          color: "#a371f7",
        }}
      >
        Prism Vector Search
      </h3>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <select
            value={column}
            onChange={(e) => setColumn(e.target.value)}
            style={inputStyle}
          >
            {columns.map((c) => (
              <option key={c.name} value={c.name}>{c.name}</option>
            ))}
          </select>
          <select
            value={metric}
            onChange={(e) => setMetric(e.target.value as VectorSearch["metric"])}
            style={{ ...inputStyle, width: 120 }}
          >
            <option value="cosine">Cosine</option>
            <option value="l2">L2</option>
            <option value="inner_product">Inner Product</option>
          </select>
          <input
            type="number"
            value={topK}
            onChange={(e) => setTopK(e.target.value)}
            placeholder="Top K"
            style={{ ...inputStyle, width: 70 }}
          />
        </div>
        <textarea
          value={vectorText}
          onChange={(e) => setVectorText(e.target.value)}
          placeholder="Reference vector (comma-separated floats)"
          rows={2}
          style={{
            ...inputStyle,
            resize: "vertical",
            fontFamily: "monospace",
          }}
        />
        <button onClick={handleApply} style={addButtonStyle}>
          Apply Vector Search
        </button>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  flex: 1,
  padding: "0.3rem 0.5rem",
  background: "#0d1117",
  border: "1px solid #30363d",
  borderRadius: 4,
  color: "#c9d1d9",
  fontSize: "0.8rem",
  minWidth: 80,
};

const addButtonStyle: React.CSSProperties = {
  padding: "0.3rem 0.6rem",
  background: "#a371f7",
  border: "none",
  borderRadius: 4,
  color: "#fff",
  cursor: "pointer",
  fontSize: "0.8rem",
  alignSelf: "flex-start",
};
