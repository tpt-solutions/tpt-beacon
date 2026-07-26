import { useState } from "react";
import type { ColumnSchema, SpatialFilter, SpatialOperation } from "../types";

interface SpatialFilterWidgetProps {
  columns: ColumnSchema[];
  onAddFilter: (filter: SpatialFilter) => void;
}

export function SpatialFilterWidget({ columns, onAddFilter }: SpatialFilterWidgetProps) {
  const [column, setColumn] = useState(columns[0]?.name ?? "");
  const [operation, setOperation] = useState<"bounding_box" | "radius" | "contains_point">(
    "radius",
  );
  const [lng, setLng] = useState("-73.9857");
  const [lat, setLat] = useState("40.7484");
  const [radius, setRadius] = useState("1000");
  const [minLng, setMinLng] = useState("-74.0");
  const [minLat, setMinLat] = useState("40.7");
  const [maxLng, setMaxLng] = useState("-73.9");
  const [maxLat, setMaxLat] = useState("40.8");

  const handleAdd = () => {
    let op: SpatialOperation;
    switch (operation) {
      case "radius":
        op = {
          Radius: { lng: Number(lng), lat: Number(lat), radius_meters: Number(radius) },
        };
        break;
      case "bounding_box":
        op = {
          BoundingBox: {
            min_lng: Number(minLng),
            min_lat: Number(minLat),
            max_lng: Number(maxLng),
            max_lat: Number(maxLat),
          },
        };
        break;
      case "contains_point":
        op = { ContainsPoint: { lng: Number(lng), lat: Number(lat) } };
        break;
    }
    onAddFilter({ column, operation: op });
  };

  return (
    <div
      style={{
        background: "#161b22",
        border: "1px solid #1f6feb",
        borderRadius: 6,
        padding: "0.75rem",
      }}
    >
      <h3
        style={{
          margin: "0 0 0.5rem",
          fontSize: "0.85rem",
          color: "#58a6ff",
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
        }}
      >
        Meridian Spatial Filter
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
            value={operation}
            onChange={(e) => setOperation(e.target.value as typeof operation)}
            style={{ ...inputStyle, width: 140 }}
          >
            <option value="radius">Radius (DWithin)</option>
            <option value="bounding_box">Bounding Box</option>
            <option value="contains_point">Contains Point</option>
          </select>
        </div>

        {(operation === "radius" || operation === "contains_point") && (
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <input
              type="number"
              step="any"
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              placeholder="Longitude"
              style={inputStyle}
            />
            <input
              type="number"
              step="any"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              placeholder="Latitude"
              style={inputStyle}
            />
            {operation === "radius" && (
              <input
                type="number"
                value={radius}
                onChange={(e) => setRadius(e.target.value)}
                placeholder="Radius (m)"
                style={inputStyle}
              />
            )}
          </div>
        )}

        {operation === "bounding_box" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
            <input type="number" step="any" value={minLng} onChange={(e) => setMinLng(e.target.value)} placeholder="Min Lng" style={inputStyle} />
            <input type="number" step="any" value={minLat} onChange={(e) => setMinLat(e.target.value)} placeholder="Min Lat" style={inputStyle} />
            <input type="number" step="any" value={maxLng} onChange={(e) => setMaxLng(e.target.value)} placeholder="Max Lng" style={inputStyle} />
            <input type="number" step="any" value={maxLat} onChange={(e) => setMaxLat(e.target.value)} placeholder="Max Lat" style={inputStyle} />
          </div>
        )}

        <button onClick={handleAdd} style={addButtonStyle}>
          + Add Spatial Filter
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
  background: "#1f6feb",
  border: "none",
  borderRadius: 4,
  color: "#fff",
  cursor: "pointer",
  fontSize: "0.8rem",
  alignSelf: "flex-start",
};
