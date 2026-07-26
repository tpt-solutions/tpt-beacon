import { useState, useEffect, useCallback } from "react";
import { Routes, Route, Link, useLocation } from "react-router-dom";
import { QueryBuilderPage } from "./pages/QueryBuilderPage";
import { SavedQueriesPage } from "./pages/SavedQueriesPage";
import { DashboardPage } from "./pages/DashboardPage";
import { LoginPage } from "./pages/LoginPage";
import { EmbedPage } from "./pages/EmbedPage";
import { getCurrentUser, clearToken, type User } from "./auth";

export function App() {
  const location = useLocation();
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    setUser(getCurrentUser());
    setAuthChecked(true);
  }, []);

  const handleLogout = useCallback(() => {
    clearToken();
    setUser(null);
  }, []);

  if (!authChecked) {
  // Embed mode — render without shell.
  if (location.pathname === "/embed") {
    return <EmbedPage />;
  }

  return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          background: "#0d1117",
          color: "#8b949e",
        }}
      >
        Loading...
      </div>
    );
  }

  if (!user) {
    return <LoginPage onAuth={setUser} />;
  }

  const navItems = [
    { path: "/", label: "Query Builder" },
    { path: "/dashboards", label: "Dashboards" },
    { path: "/saved", label: "Saved Queries" },
  ];

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        fontFamily: "system-ui, -apple-system, sans-serif",
        background: "#0f1117",
        color: "#e1e4e8",
      }}
    >
      {/* Sidebar */}
      <nav
        style={{
          width: 220,
          background: "#161b22",
          borderRight: "1px solid #30363d",
          padding: "1rem 0",
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            padding: "0 1rem 1rem",
            borderBottom: "1px solid #30363d",
            marginBottom: "1rem",
          }}
        >
          <h1 style={{ fontSize: "1.1rem", margin: 0, color: "#58a6ff" }}>
            TPT Beacon
          </h1>
          <p style={{ fontSize: "0.75rem", margin: "0.25rem 0 0", color: "#8b949e" }}>
            pre-alpha
          </p>
        </div>
        {navItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            style={{
              display: "block",
              padding: "0.5rem 1rem",
              color: location.pathname === item.path ? "#58a6ff" : "#c9d1d9",
              textDecoration: "none",
              background: location.pathname === item.path ? "#1f2937" : "transparent",
              fontSize: "0.9rem",
            }}
          >
            {item.label}
          </Link>
        ))}
        <div style={{ flex: 1 }} />
        {/* User info */}
        <div
          style={{
            padding: "0.75rem 1rem",
            borderTop: "1px solid #30363d",
            fontSize: "0.8rem",
          }}
        >
          <div style={{ color: "#c9d1d9", marginBottom: "0.25rem" }}>
            {user.display_name}
          </div>
          <div style={{ color: "#484f58", fontSize: "0.7rem", marginBottom: "0.5rem" }}>
            {user.role}
          </div>
          <button
            onClick={handleLogout}
            style={{
              background: "none",
              border: "1px solid #30363d",
              borderRadius: 4,
              color: "#8b949e",
              cursor: "pointer",
              fontSize: "0.75rem",
              padding: "0.2rem 0.5rem",
            }}
          >
            Sign out
          </button>
        </div>
      </nav>

      {/* Main content */}
      <main style={{ flex: 1, overflow: "auto" }}>
        <Routes>
          <Route path="/" element={<QueryBuilderPage />} />
          <Route path="/dashboards" element={<DashboardPage />} />
          <Route path="/saved" element={<SavedQueriesPage />} />
        </Routes>
      </main>
    </div>
  );
}
