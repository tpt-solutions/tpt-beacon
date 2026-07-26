interface SqlPreviewProps {
  sql: string;
  costTier: string;
}

const costColors: Record<string, { bg: string; border: string; text: string }> = {
  low: { bg: "#1a3a1a", border: "#238636", text: "#3fb950" },
  medium: { bg: "#3a3a1a", border: "#d29922", text: "#d29922" },
  high: { bg: "#3a1a1a", border: "#6e3630", text: "#f85149" },
};

export function SqlPreview({ sql, costTier }: SqlPreviewProps) {
  const colors = costColors[costTier] ?? costColors.low;

  return (
    <div
      style={{
        background: "#161b22",
        border: `1px solid #30363d`,
        borderRadius: 6,
        padding: "0.75rem",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          marginBottom: "0.5rem",
        }}
      >
        <h3 style={{ margin: 0, fontSize: "0.85rem", color: "#8b949e" }}>SQL Preview</h3>
        <span
          style={{
            fontSize: "0.7rem",
            padding: "0.1rem 0.4rem",
            background: colors.bg,
            border: `1px solid ${colors.border}`,
            borderRadius: 3,
            color: colors.text,
            textTransform: "uppercase",
            fontWeight: 600,
          }}
        >
          {costTier} cost
        </span>
      </div>
      <pre
        style={{
          margin: 0,
          padding: "0.75rem",
          background: "#0d1117",
          border: "1px solid #30363d",
          borderRadius: 4,
          fontSize: "0.8rem",
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          color: "#c9d1d9",
          overflow: "auto",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          lineHeight: 1.5,
        }}
      >
        {sql}
      </pre>
    </div>
  );
}
