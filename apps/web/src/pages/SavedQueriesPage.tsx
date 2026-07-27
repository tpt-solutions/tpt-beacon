// SPDX-License-Identifier: MIT OR Apache-2.0
import { useState, useEffect, useCallback } from "react";
import type { SavedQuery } from "../types";
import { fetchSavedQueries, deleteQuery } from "../api";

export function SavedQueriesPage() {
  const [queries, setQueries] = useState<SavedQuery[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchSavedQueries();
      setQueries(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = useCallback(
    async (id: string) => {
      await deleteQuery(id);
      load();
    },
    [load],
  );

  return (
    <div style={{ padding: "2rem" }}>
      <h2 style={{ margin: "0 0 1rem", fontSize: "1.2rem" }}>Saved Queries</h2>
      {loading ? (
        <p style={{ color: "#8b949e" }}>Loading...</p>
      ) : queries.length === 0 ? (
        <p style={{ color: "#8b949e" }}>
          No saved queries yet. Create one in the Query Builder.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {queries.map((q) => (
            <div
              key={q.id}
              style={{
                padding: "1rem",
                background: "#161b22",
                border: "1px solid #30363d",
                borderRadius: 6,
                display: "flex",
                alignItems: "center",
                gap: "1rem",
              }}
            >
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: 0, fontSize: "1rem" }}>{q.name}</h3>
                <p style={{ margin: "0.25rem 0 0", fontSize: "0.8rem", color: "#8b949e" }}>
                  Source: {q.definition.source} | Created:{" "}
                  {new Date(q.created_at).toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={() => handleDelete(q.id)}
                style={{
                  padding: "0.3rem 0.6rem",
                  background: "#3d1f1f",
                  border: "1px solid #6e3630",
                  borderRadius: 4,
                  color: "#f85149",
                  cursor: "pointer",
                  fontSize: "0.8rem",
                }}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
