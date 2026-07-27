// SPDX-License-Identifier: MIT OR Apache-2.0
import { useState } from "react";
import type { ColumnSchema, TimeBucket, TimeInterval } from "../types";

interface TimeBucketWidgetProps {
  columns: ColumnSchema[];
  onSetTimeBucket: (tb: TimeBucket) => void;
}

export function TimeBucketWidget({ columns, onSetTimeBucket }: TimeBucketWidgetProps) {
  const [timeColumn, setTimeColumn] = useState(columns[0]?.name ?? "");
  const [interval, setInterval] = useState<TimeInterval>("hour");

  const handleApply = () => {
    onSetTimeBucket({ time_column: timeColumn, interval });
  };

  return (
    <div
      style={{
        background: "#161b22",
        border: "1px solid #d29922",
        borderRadius: 6,
        padding: "0.75rem",
      }}
    >
      <h3
        style={{
          margin: "0 0 0.5rem",
          fontSize: "0.85rem",
          color: "#d29922",
        }}
      >
        Chronos Time Bucket
      </h3>
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <select
          value={timeColumn}
          onChange={(e) => setTimeColumn(e.target.value)}
          style={inputStyle}
        >
          {columns.map((c) => (
            <option key={c.name} value={c.name}>{c.name}</option>
          ))}
        </select>
        <select
          value={interval as string}
          onChange={(e) => setInterval(e.target.value as TimeInterval)}
          style={{ ...inputStyle, width: 120 }}
        >
          <option value="second">Second</option>
          <option value="minute">Minute</option>
          <option value="hour">Hour</option>
          <option value="day">Day</option>
          <option value="week">Week</option>
          <option value="month">Month</option>
          <option value="quarter">Quarter</option>
          <option value="year">Year</option>
        </select>
        <button onClick={handleApply} style={addButtonStyle}>
          Apply
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
  background: "#d29922",
  border: "none",
  borderRadius: 4,
  color: "#fff",
  cursor: "pointer",
  fontSize: "0.8rem",
};
