// SPDX-License-Identifier: MIT OR Apache-2.0
/**
 * Plexus graph visualization component.
 *
 * Force-directed graph layout using D3.
 * Renders nodes and edges for graph data from Plexus queries.
 */

import { useEffect, useRef, useMemo } from "react";
import * as d3 from "d3";
import { defaultTheme, chartColors, type ChartTheme } from "./theme";

export interface GraphNode {
  id: string;
  label?: string;
  group?: string;
  size?: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  weight?: number;
  label?: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface PlexusGraphProps {
  data: GraphData;
  /** Node color by group. */
  groupKey?: string;
  /** Run simulation for N ticks (0 = static layout). */
  simulationTicks?: number;
  theme?: Partial<ChartTheme>;
}

export function PlexusGraph({
  data,
  groupKey = "group",
  simulationTicks = 120,
  theme: userTheme,
}: PlexusGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const t = useMemo(() => ({ ...defaultTheme, ...userTheme }), [userTheme]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || data.nodes.length === 0) return;

    const rect = container.getBoundingClientRect();
    const width = rect.width || t.width;
    const height = rect.height || t.height;

    canvas.width = width * (window.devicePixelRatio || 1);
    canvas.height = height * (window.devicePixelRatio || 1);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
    ctx.clearRect(0, 0, width, height);

    // Build simulation data.
    const nodes: (d3.SimulationNodeDatum & { id: string; [key: string]: unknown })[] = data.nodes.map((n) => ({
      ...n,
      x: width / 2 + (Math.random() - 0.5) * 100,
      y: height / 2 + (Math.random() - 0.5) * 100,
    }));
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));

    const links: d3.SimulationLinkDatum<d3.SimulationNodeDatum>[] = data.edges
      .filter((e) => nodeMap.has(e.source) && nodeMap.has(e.target))
      .map((e) => ({
        source: nodeMap.get(e.source)!,
        target: nodeMap.get(e.target)!,
        weight: e.weight ?? 1,
      }));

    // Run force simulation.
    const simulation = d3
      .forceSimulation(nodes)
      .force("link", d3.forceLink(links).distance(80).strength(0.3))
      .force("charge", d3.forceManyBody().strength(-200))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius(20))
      .stop();

    // Step simulation synchronously.
    for (let i = 0; i < simulationTicks; i++) {
      simulation.tick();
    }

    // Compute groups and colors.
    const groups = [...new Set(data.nodes.map((n) => String(n[groupKey as keyof GraphNode] ?? "default")))];
    const colorScale = d3.scaleOrdinal<string>().domain(groups).range(chartColors.palette);

    // Compute node sizes.
    const sizeExtent = d3.extent(data.nodes, (n) => n.size ?? 1) as [number, number];
    const sizeScale = d3.scaleSqrt().domain(sizeExtent).range([6, 20]);

    // Draw edges.
    ctx.strokeStyle = chartColors.border;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.5;
    for (const link of links) {
      const s = link.source as d3.SimulationNodeDatum;
      const tgt = link.target as d3.SimulationNodeDatum;
      ctx.beginPath();
      ctx.moveTo(s.x ?? 0, s.y ?? 0);
      ctx.lineTo(tgt.x ?? 0, tgt.y ?? 0);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Draw nodes.
    for (const node of nodes) {
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      const group = String((node as unknown as GraphNode)[groupKey as keyof GraphNode] ?? "default");
      const r = sizeScale((node as GraphNode).size ?? 1);

      // Node circle.
      ctx.fillStyle = colorScale(group);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();

      // Node border.
      ctx.strokeStyle = chartColors.background;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Node label.
      const label = (node as GraphNode).label ?? node.id;
      if (label && r >= 6) {
        ctx.fillStyle = chartColors.text;
        ctx.font = "10px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(label, x, y - r - 4);
      }
    }

    // Draw edge labels (if present).
    const edgeLabels = data.edges.filter((e) => e.label);
    if (edgeLabels.length > 0) {
      ctx.fillStyle = chartColors.textSecondary;
      ctx.font = "9px system-ui, sans-serif";
      ctx.textAlign = "center";
      for (const edge of edgeLabels) {
        const src = nodeMap.get(edge.source);
        const tgt = nodeMap.get(edge.target);
        if (src && tgt) {
          const sx = (src as d3.SimulationNodeDatum).x ?? 0;
          const sy = (src as d3.SimulationNodeDatum).y ?? 0;
          const tx = (tgt as d3.SimulationNodeDatum).x ?? 0;
          const ty = (tgt as d3.SimulationNodeDatum).y ?? 0;
          const mx = (sx + tx) / 2;
          const my = (sy + ty) / 2;
          ctx.fillText(edge.label!, mx, my - 4);
        }
      }
    }

    // Legend.
    if (groups.length > 1 && groups.length <= 12) {
      let legendY = 20;
      ctx.font = "11px system-ui, sans-serif";
      ctx.textAlign = "left";
      for (const group of groups.slice(0, 12)) {
        ctx.fillStyle = colorScale(group);
        ctx.beginPath();
        ctx.arc(16, legendY - 3, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = chartColors.text;
        ctx.fillText(group, 26, legendY);
        legendY += 16;
      }
    }
  }, [data, groupKey, simulationTicks, t]);

  if (data.nodes.length === 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200, color: chartColors.textSecondary }}>
        No graph data
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ width: "100%", height: "100%", minHeight: 300 }}>
      <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%" }} />
    </div>
  );
}
