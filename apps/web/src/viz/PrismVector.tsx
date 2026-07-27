// SPDX-License-Identifier: MIT OR Apache-2.0
/**
 * Prism vector search result visualization.
 *
 * Renders a ranked list of similarity results with score bars.
 */

import { useMemo } from "react";
import { chartColors } from "./theme";

export interface VectorResult {
  id: string;
  label?: string;
  score: number;
  metadata?: Record<string, unknown>;
}

export interface PrismVectorProps {
  results: VectorResult[];
  /** Maximum score value for bar scaling (default: max in results). */
  maxScore?: number;
  /** Number of results to show. */
  limit?: number;
}

export function PrismVector({
  results,
  maxScore: maxScoreProp,
  limit = 20,
}: PrismVectorProps) {
  const sorted = useMemo(() => {
    return [...results]
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }, [results, limit]);

  const maxScore = maxScoreProp ?? Math.max(...sorted.map((r) => r.score), 1);

  if (sorted.length === 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200, color: chartColors.textSecondary }}>
        No vector search results
      </div>
    );
  }

  return (
    <div style={{ padding: "0.5rem", overflow: "auto", maxHeight: "100%" }}>
      {sorted.map((result, i) => {
        const pct = Math.min((result.score / maxScore) * 100, 100);
        const barColor = i === 0 ? chartColors.primary : i < 3 ? chartColors.secondary : chartColors.textSecondary;
        return (
          <div
            key={result.id}
            style={{
              marginBottom: "0.5rem",
              padding: "0.4rem 0.5rem",
              background: i === 0 ? "rgba(88, 166, 255, 0.08)" : "transparent",
              borderRadius: 4,
              border: i === 0 ? "1px solid rgba(88, 166, 255, 0.2)" : "1px solid transparent",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: "0.8rem", color: chartColors.text }}>
                <span style={{ color: chartColors.textSecondary, marginRight: 6 }}>#{i + 1}</span>
                {result.label ?? result.id}
              </span>
              <span style={{ fontSize: "0.75rem", color: barColor, fontFamily: "monospace" }}>
                {result.score.toFixed(4)}
              </span>
            </div>
            {/* Score bar */}
            <div
              style={{
                height: 6,
                background: chartColors.border,
                borderRadius: 3,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${pct}%`,
                  background: barColor,
                  borderRadius: 3,
                  transition: "width 0.3s ease",
                }}
              />
            </div>
            {/* Metadata */}
            {result.metadata && Object.keys(result.metadata).length > 0 && (
              <div style={{ marginTop: 4, fontSize: "0.7rem", color: chartColors.textMuted }}>
                {Object.entries(result.metadata).map(([k, v]) => (
                  <span key={k} style={{ marginRight: 8 }}>
                    {k}: {String(v)}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
