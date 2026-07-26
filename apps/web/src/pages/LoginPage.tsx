import { useState } from "react";
import { login, signup, type User } from "../auth";

interface LoginPageProps {
  onAuth: (user: User) => void;
}

export function LoginPage({ onAuth }: LoginPageProps) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result =
        mode === "login"
          ? await login(email, password)
          : await signup(email, password, displayName);
      onAuth(result.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Auth failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        background: "#0d1117",
      }}
    >
      <div
        style={{
          width: 380,
          padding: "2rem",
          background: "#161b22",
          border: "1px solid #30363d",
          borderRadius: 12,
        }}
      >
        <h1
          style={{
            margin: "0 0 0.25rem",
            fontSize: "1.3rem",
            color: "#c9d1d9",
            textAlign: "center",
          }}
        >
          TPT Beacon
        </h1>
        <p
          style={{
            margin: "0 0 1.5rem",
            fontSize: "0.8rem",
            color: "#8b949e",
            textAlign: "center",
          }}
        >
          {mode === "login" ? "Sign in to your account" : "Create an account"}
        </p>

        {error && (
          <div
            style={{
              padding: "0.5rem 0.75rem",
              background: "#3d1f1f",
              border: "1px solid #6e3630",
              borderRadius: 6,
              color: "#f85149",
              fontSize: "0.8rem",
              marginBottom: "1rem",
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {mode === "signup" && (
            <div style={{ marginBottom: "0.75rem" }}>
              <label
                style={{ display: "block", fontSize: "0.8rem", color: "#8b949e", marginBottom: "0.25rem" }}
              >
                Display Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                style={inputStyle}
              />
            </div>
          )}
          <div style={{ marginBottom: "0.75rem" }}>
            <label
              style={{ display: "block", fontSize: "0.8rem", color: "#8b949e", marginBottom: "0.25rem" }}
            >
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: "1rem" }}>
            <label
              style={{ display: "block", fontSize: "0.8rem", color: "#8b949e", marginBottom: "0.25rem" }}
            >
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={inputStyle}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "0.5rem",
              background: "#238636",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              cursor: loading ? "wait" : "pointer",
              fontSize: "0.85rem",
              fontWeight: 600,
              marginBottom: "0.75rem",
            }}
          >
            {loading ? "..." : mode === "login" ? "Sign In" : "Create Account"}
          </button>
        </form>

        <p style={{ textAlign: "center", margin: 0, fontSize: "0.8rem", color: "#8b949e" }}>
          {mode === "login" ? (
            <>
              Don't have an account?{" "}
              <button
                onClick={() => { setMode("signup"); setError(null); }}
                style={linkStyle}
              >
                Sign up
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button
                onClick={() => { setMode("login"); setError(null); }}
                style={linkStyle}
              >
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.4rem 0.6rem",
  background: "#0d1117",
  border: "1px solid #30363d",
  borderRadius: 4,
  color: "#c9d1d9",
  fontSize: "0.85rem",
  boxSizing: "border-box",
};

const linkStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#58a6ff",
  cursor: "pointer",
  fontSize: "0.8rem",
  padding: 0,
};
