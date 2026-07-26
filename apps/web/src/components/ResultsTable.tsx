interface ResultsTableProps {
  columns: { name: string; type: string }[];
  rows?: Record<string, unknown>[];
  rowCount?: number;
}

export function ResultsTable({ columns, rows = [], rowCount }: ResultsTableProps) {
  const count = rowCount ?? rows.length;

  return (
    <div style={{ padding: "0.75rem 1rem" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          marginBottom: "0.5rem",
        }}
      >
        <h3 style={{ margin: 0, fontSize: "0.85rem", color: "#8b949e" }}>Results</h3>
        <span style={{ fontSize: "0.75rem", color: "#484f58" }}>
          {count} row{count !== 1 ? "s" : ""}
        </span>
      </div>
      {columns.length > 0 ? (
        <div
          style={{
            border: "1px solid #30363d",
            borderRadius: 4,
            overflow: "auto",
          }}
        >
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "0.8rem",
            }}
          >
            <thead>
              <tr style={{ background: "#161b22" }}>
                {columns.map((col) => (
                  <th
                    key={col.name}
                    style={{
                      padding: "0.5rem 0.75rem",
                      textAlign: "left",
                      borderBottom: "1px solid #30363d",
                      color: "#8b949e",
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {col.name}
                    <span
                      style={{
                        display: "block",
                        fontSize: "0.65rem",
                        fontWeight: 400,
                        color: "#484f58",
                      }}
                    >
                      {col.type}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length > 0 ? (
                rows.map((row, i) => (
                  <tr
                    key={i}
                    style={{
                      background: i % 2 === 0 ? "#0d1117" : "#161b22",
                    }}
                  >
                    {columns.map((col) => (
                      <td
                        key={col.name}
                        style={{
                          padding: "0.4rem 0.75rem",
                          borderBottom: "1px solid #21262d",
                          color: "#c9d1d9",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {String(row[col.name] ?? "")}
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={columns.length}
                    style={{
                      padding: "1rem",
                      textAlign: "center",
                      color: "#484f58",
                    }}
                  >
                    Query executed successfully. Connect to Keystone to view actual results.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <p style={{ fontSize: "0.8rem", color: "#484f58" }}>
          Run a query to see results.
        </p>
      )}
    </div>
  );
}
