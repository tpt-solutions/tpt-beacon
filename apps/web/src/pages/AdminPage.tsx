// SPDX-License-Identifier: MIT OR Apache-2.0
import { useState, useEffect } from "react";
import {
  listApiTokens,
  createApiToken,
  deleteApiToken,
  listShareLinks,
  createShareLink,
  deleteShareLink,
  getAuditLog,
  type ApiToken,
  type ShareLink,
  type AuditEntry,
  getCurrentUser,
} from "../auth";

const btnStyle = {
  background: "none",
  border: "1px solid #30363d",
  borderRadius: 4,
  color: "#c9d1d9",
  cursor: "pointer",
  fontSize: "0.8rem",
  padding: "0.3rem 0.6rem",
};

const inputStyle = {
  background: "#0d1117",
  border: "1px solid #30363d",
  borderRadius: 4,
  color: "#e1e4e8",
  fontSize: "0.85rem",
  padding: "0.4rem 0.6rem",
  width: "100%",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "1.5rem" }}>
      <h2 style={{ fontSize: "1rem", margin: "0 0 0.75rem", color: "#58a6ff" }}>{title}</h2>
      {children}
    </div>
  );
}

export function AdminPage() {
  const user = getCurrentUser();
  if (user?.role !== "admin") {
    return (
      <div style={{ padding: "2rem", color: "#f85149" }}>
        Admin access required.
      </div>
    );
  }

  return (
    <div style={{ padding: "1.5rem 2rem", maxWidth: 900 }}>
      <h1 style={{ fontSize: "1.2rem", margin: "0 0 1.5rem", color: "#e1e4e8" }}>
        Admin
      </h1>
      <ApiTokensSection />
      <ShareLinksSection />
      <AuditLogSection />
    </div>
  );
}

function ApiTokensSection() {
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState("read");
  const [expiresHours, setExpiresHours] = useState("");
  const [newToken, setNewToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = () => listApiTokens().then(setTokens);

  useEffect(() => { refresh(); }, []);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setLoading(true);
    const result = await createApiToken(
      name.trim(),
      scopes.split(",").map((s) => s.trim()).filter(Boolean),
      expiresHours ? parseInt(expiresHours, 10) : undefined,
    );
    setLoading(false);
    if (result) {
      setNewToken(result.raw_token);
      setName("");
      refresh();
    }
  };

  const handleDelete = async (id: string) => {
    await deleteApiToken(id);
    refresh();
  };

  return (
    <Section title="API Tokens">
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem", alignItems: "center" }}>
        <input
          placeholder="Token name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ ...inputStyle, width: 180 }}
        />
        <input
          placeholder="Scopes (comma-sep)"
          value={scopes}
          onChange={(e) => setScopes(e.target.value)}
          style={{ ...inputStyle, width: 180 }}
        />
        <input
          placeholder="Expires (hours)"
          value={expiresHours}
          onChange={(e) => setExpiresHours(e.target.value)}
          style={{ ...inputStyle, width: 120 }}
        />
        <button onClick={handleCreate} disabled={loading} style={btnStyle}>
          {loading ? "..." : "Create"}
        </button>
      </div>

      {newToken && (
        <div
          style={{
            background: "#1a2332",
            border: "1px solid #238636",
            borderRadius: 6,
            padding: "0.5rem 0.75rem",
            marginBottom: "0.75rem",
            fontSize: "0.8rem",
            fontFamily: "monospace",
            color: "#3fb950",
            wordBreak: "break-all",
          }}
        >
          <strong>Raw token (copy now, shown once):</strong> {newToken}
          <button
            onClick={() => setNewToken(null)}
            style={{ ...btnStyle, marginLeft: 8, fontSize: "0.7rem" }}
          >
            dismiss
          </button>
        </div>
      )}

      {tokens.length === 0 ? (
        <p style={{ color: "#484f58", fontSize: "0.85rem" }}>No tokens yet.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
          <thead>
            <tr style={{ color: "#8b949e", textAlign: "left" }}>
              <th style={{ padding: "0.4rem 0.5rem" }}>Name</th>
              <th style={{ padding: "0.4rem 0.5rem" }}>Scopes</th>
              <th style={{ padding: "0.4rem 0.5rem" }}>Created</th>
              <th style={{ padding: "0.4rem 0.5rem" }}>Last Used</th>
              <th style={{ padding: "0.4rem 0.5rem" }} />
            </tr>
          </thead>
          <tbody>
            {tokens.map((t) => (
              <tr key={t.id} style={{ borderTop: "1px solid #21262d" }}>
                <td style={{ padding: "0.4rem 0.5rem", color: "#c9d1d9" }}>{t.name}</td>
                <td style={{ padding: "0.4rem 0.5rem", color: "#8b949e" }}>{t.scopes.join(", ")}</td>
                <td style={{ padding: "0.4rem 0.5rem", color: "#8b949e" }}>
                  {new Date(t.created_at).toLocaleDateString()}
                </td>
                <td style={{ padding: "0.4rem 0.5rem", color: "#8b949e" }}>
                  {t.last_used ? new Date(t.last_used).toLocaleDateString() : "never"}
                </td>
                <td style={{ padding: "0.4rem 0.5rem" }}>
                  <button onClick={() => handleDelete(t.id)} style={{ ...btnStyle, color: "#f85149" }}>
                    Revoke
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Section>
  );
}

function ShareLinksSection() {
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [resourceType, setResourceType] = useState("dashboard");
  const [resourceId, setResourceId] = useState("");
  const [permission, setPermission] = useState<"view" | "edit">("view");
  const [expiresHours, setExpiresHours] = useState("");
  const [loading, setLoading] = useState(false);

  const refresh = () => listShareLinks(resourceType, resourceId).then(setLinks);
  useEffect(() => { refresh(); }, [resourceType, resourceId]);

  const handleCreate = async () => {
    if (!resourceId.trim()) return;
    setLoading(true);
    const link = await createShareLink(
      resourceType,
      resourceId.trim(),
      permission,
      expiresHours ? parseInt(expiresHours, 10) : undefined,
    );
    setLoading(false);
    if (link) {
      setResourceId("");
      refresh();
    }
  };

  const handleDelete = async (id: string) => {
    await deleteShareLink(id);
    refresh();
  };

  return (
    <Section title="Share Links">
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem", alignItems: "center" }}>
        <select
          value={resourceType}
          onChange={(e) => setResourceType(e.target.value)}
          style={{ ...inputStyle, width: 130 }}
        >
          <option value="dashboard">Dashboard</option>
          <option value="query">Query</option>
        </select>
        <input
          placeholder="Resource ID"
          value={resourceId}
          onChange={(e) => setResourceId(e.target.value)}
          style={{ ...inputStyle, width: 200 }}
        />
        <select
          value={permission}
          onChange={(e) => setPermission(e.target.value as "view" | "edit")}
          style={{ ...inputStyle, width: 100 }}
        >
          <option value="view">View</option>
          <option value="edit">Edit</option>
        </select>
        <input
          placeholder="Expires (hours)"
          value={expiresHours}
          onChange={(e) => setExpiresHours(e.target.value)}
          style={{ ...inputStyle, width: 120 }}
        />
        <button onClick={handleCreate} disabled={loading} style={btnStyle}>
          {loading ? "..." : "Create"}
        </button>
      </div>

      {links.length === 0 ? (
        <p style={{ color: "#484f58", fontSize: "0.85rem" }}>No share links.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
          <thead>
            <tr style={{ color: "#8b949e", textAlign: "left" }}>
              <th style={{ padding: "0.4rem 0.5rem" }}>ID</th>
              <th style={{ padding: "0.4rem 0.5rem" }}>Resource</th>
              <th style={{ padding: "0.4rem 0.5rem" }}>Permission</th>
              <th style={{ padding: "0.4rem 0.5rem" }}>Created By</th>
              <th style={{ padding: "0.4rem 0.5rem" }}>Expires</th>
              <th style={{ padding: "0.4rem 0.5rem" }} />
            </tr>
          </thead>
          <tbody>
            {links.map((l) => (
              <tr key={l.id} style={{ borderTop: "1px solid #21262d" }}>
                <td style={{ padding: "0.4rem 0.5rem", color: "#8b949e", fontFamily: "monospace", fontSize: "0.75rem" }}>
                  {l.id}
                </td>
                <td style={{ padding: "0.4rem 0.5rem", color: "#c9d1d9" }}>
                  {l.resource_type}/{l.resource_id}
                </td>
                <td style={{ padding: "0.4rem 0.5rem", color: "#c9d1d9" }}>{l.permission}</td>
                <td style={{ padding: "0.4rem 0.5rem", color: "#8b949e" }}>{l.created_by}</td>
                <td style={{ padding: "0.4rem 0.5rem", color: "#8b949e" }}>
                  {l.expires_at ? new Date(l.expires_at).toLocaleDateString() : "never"}
                </td>
                <td style={{ padding: "0.4rem 0.5rem" }}>
                  <button onClick={() => handleDelete(l.id)} style={{ ...btnStyle, color: "#f85149" }}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Section>
  );
}

function AuditLogSection() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);

  useEffect(() => {
    getAuditLog(50).then(setEntries);
  }, []);

  return (
    <Section title="Audit Log">
      {entries.length === 0 ? (
        <p style={{ color: "#484f58", fontSize: "0.85rem" }}>No audit entries yet.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
          <thead>
            <tr style={{ color: "#8b949e", textAlign: "left" }}>
              <th style={{ padding: "0.4rem 0.5rem" }}>Time</th>
              <th style={{ padding: "0.4rem 0.5rem" }}>User</th>
              <th style={{ padding: "0.4rem 0.5rem" }}>Action</th>
              <th style={{ padding: "0.4rem 0.5rem" }}>Resource</th>
              <th style={{ padding: "0.4rem 0.5rem" }}>Details</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} style={{ borderTop: "1px solid #21262d" }}>
                <td style={{ padding: "0.4rem 0.5rem", color: "#8b949e" }}>
                  {new Date(e.timestamp).toLocaleString()}
                </td>
                <td style={{ padding: "0.4rem 0.5rem", color: "#c9d1d9", fontFamily: "monospace", fontSize: "0.75rem" }}>
                  {e.user_id}
                </td>
                <td style={{ padding: "0.4rem 0.5rem", color: "#58a6ff" }}>{e.action}</td>
                <td style={{ padding: "0.4rem 0.5rem", color: "#c9d1d9" }}>
                  {e.resource_type}/{e.resource_id}
                </td>
                <td style={{ padding: "0.4rem 0.5rem", color: "#8b949e" }}>
                  {e.details || "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Section>
  );
}
