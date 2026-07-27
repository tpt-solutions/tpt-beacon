// SPDX-License-Identifier: MIT OR Apache-2.0
/**
 * DependencyGraph — renders a dashboard's query/table dependency graph.
 *
 * Uses D3 force-directed layout on a Canvas element.
 */

import { useRef, useEffect, useMemo } from "react";
import * as d3 from "d3";
import type { DependencyGraph as DepGraph, DepNode } from "../dashboard/dependencies";

interface Props {
  graph: DepGraph;
  width?: number;
  height?: number;
}

const NODE_COLORS: Record<string, string> = {
  dashboard: "#f0883e",
  widget: "#58a6ff",
  query: "#3fb950",
  table: "#d2a8ff",
};

const NODE_RADIUS: Record<string, number> = {
  dashboard: 18,
  widget: 12,
  query: 10,
  table: 14,
};

interface SimNode extends DepNode, d3.SimulationNodeDatum {}
interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  source: string;
  target: string;
  label?: string;
}

export function DependencyGraph({ graph, width = 600, height = 400 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const simNodes = useMemo<SimNode[]>(
    () => graph.nodes.map((n) => ({ ...n })),
    [graph],
  );
  const simLinks = useMemo<SimLink[]>(
    () => graph.edges.map((e) => ({ source: e.from, target: e.to, label: e.label })),
    [graph],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || simNodes.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Narrow ctx for the rest of the effect.
    const c = ctx;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    c.scale(dpr, dpr);

    const simulation = d3
      .forceSimulation<SimNode>(simNodes)
      .force(
        "link",
        d3.forceLink<SimNode, SimLink>(simLinks).id((d) => d.id).distance(80),
      )
      .force("charge", d3.forceManyBody().strength(-200))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius(30));

    function draw() {
      c.clearRect(0, 0, width, height);

      // Draw edges.
      for (const link of simLinks) {
        const src = link.source as unknown as SimNode;
        const tgt = link.target as unknown as SimNode;
        if (!src.x || !tgt.x) continue;
        c.beginPath();
        c.moveTo(src.x, src.y ?? 0);
        c.lineTo(tgt.x, tgt.y ?? 0);
        c.strokeStyle = "#30363d";
        c.lineWidth = 1.5;
        c.stroke();
        // Edge label.
        if (link.label) {
          const mx = (src.x + tgt.x) / 2;
          const my = ((src.y ?? 0) + (tgt.y ?? 0)) / 2;
          c.fillStyle = "#8b949e";
          c.font = "10px sans-serif";
          c.textAlign = "center";
          c.fillText(link.label, mx, my - 4);
        }
      }

      // Draw nodes.
      for (const node of simNodes) {
        if (!node.x || !node.y) continue;
        const r = NODE_RADIUS[node.type] ?? 10;
        c.beginPath();
        c.arc(node.x, node.y, r, 0, Math.PI * 2);
        c.fillStyle = NODE_COLORS[node.type] ?? "#8b949e";
        c.fill();
        // Label.
        c.fillStyle = "#e6edf3";
        c.font = "11px sans-serif";
        c.textAlign = "center";
        c.fillText(node.label, node.x, node.y + r + 14);
      }
    }

    simulation.on("tick", draw);
    draw();

    return () => {
      simulation.stop();
    };
  }, [simNodes, simLinks, width, height]);

  if (simNodes.length === 0) {
    return (
      <div
        style={{
          width,
          height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#8b949e",
          fontSize: "0.85rem",
        }}
      >
        No dependencies found.
      </div>
    );
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        style={{ width, height, borderRadius: 8 }}
      />
      <div style={{ display: "flex", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
        {Object.entries(NODE_COLORS).map(([type, color]) => (
          <div key={type} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "0.75rem", color: "#8b949e" }}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: color,
                display: "inline-block",
              }}
            />
            {type}
          </div>
        ))}
      </div>
    </div>
  );
}
