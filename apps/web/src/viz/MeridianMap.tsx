// SPDX-License-Identifier: MIT OR Apache-2.0
/**
 * Meridian map visualization component.
 *
 * Renders geographic data (points, clusters, heatmap) using D3 + Canvas.
 * Supports latitude/longitude columns for point data.
 */

import { useEffect, useRef, useMemo } from "react";
import * as d3 from "d3";
import { defaultTheme, chartColors, type ChartTheme, type ChartDataPoint } from "./theme";

export interface MeridianMapProps {
  data: ChartDataPoint[];
  /** Column name for longitude. */
  lonKey: string;
  /** Column name for latitude. */
  latKey: string;
  /** Column name for point size (optional). */
  sizeKey?: string;
  /** Column name for color grouping (optional). */
  groupKey?: string;
  /** Render mode: points, heatmap. */
  mode?: "points" | "heatmap";
  theme?: Partial<ChartTheme>;
}

export function MeridianMap({
  data,
  lonKey,
  latKey,
  sizeKey,
  groupKey,
  mode = "points",
  theme: userTheme,
}: MeridianMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const t = useMemo(() => ({ ...defaultTheme, ...userTheme }), [userTheme]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || data.length === 0) return;

    const rect = container.getBoundingClientRect();
    const width = rect.width || t.width;
    const height = rect.height || t.height;
    const margin = t.margin;

    canvas.width = width * (window.devicePixelRatio || 1);
    canvas.height = height * (window.devicePixelRatio || 1);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
    ctx.clearRect(0, 0, width, height);

    // Extract coordinates.
    const points = data
      .map((d) => ({
        lon: Number(d[lonKey]) || 0,
        lat: Number(d[latKey]) || 0,
        size: sizeKey ? Number(d[sizeKey]) || 1 : 1,
        group: groupKey ? String(d[groupKey]) : "default",
        raw: d,
      }))
      .filter((p) => p.lon !== 0 || p.lat !== 0);

    if (points.length === 0) return;

    // Compute projection (Mercator-like simple bounding box).
    const lonExtent = d3.extent(points, (p) => p.lon) as [number, number];
    const latExtent = d3.extent(points, (p) => p.lat) as [number, number];
    const padding = 30;

    const xScale = d3
      .scaleLinear()
      .domain(lonExtent)
      .range([margin.left + padding, width - margin.right - padding]);

    const yScale = d3
      .scaleLinear()
      .domain(latExtent)
      .range([height - margin.bottom - padding, margin.top + padding]);

    // Group colors.
    const groups = [...new Set(points.map((p) => p.group))];
    const colorScale = d3.scaleOrdinal<string>().domain(groups).range(chartColors.palette);

    // Size scale.
    const sizeExtent = d3.extent(points, (p) => p.size) as [number, number];
    const sizeScale = d3
      .scaleSqrt()
      .domain(sizeExtent)
      .range([2, 12]);

    // Draw background.
    ctx.fillStyle = chartColors.surface;
    ctx.fillRect(margin.left, margin.top, width - margin.left - margin.right, height - margin.top - margin.bottom);

    // Draw grid lines.
    ctx.strokeStyle = chartColors.border;
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const x = margin.left + (width - margin.left - margin.right) * (i / 4);
      ctx.beginPath();
      ctx.moveTo(x, margin.top);
      ctx.lineTo(x, height - margin.bottom);
      ctx.stroke();

      const y = margin.top + (height - margin.top - margin.bottom) * (i / 4);
      ctx.beginPath();
      ctx.moveTo(margin.left, y);
      ctx.lineTo(width - margin.right, y);
      ctx.stroke();
    }

    if (mode === "heatmap") {
      // Heatmap: draw circles with low opacity for density.
      for (const p of points) {
        const x = xScale(p.lon);
        const y = yScale(p.lat);
        const radius = sizeScale(p.size) * 3;
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
        gradient.addColorStop(0, "rgba(88, 166, 255, 0.4)");
        gradient.addColorStop(1, "rgba(88, 166, 255, 0)");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      // Points: draw colored circles.
      for (const p of points) {
        const x = xScale(p.lon);
        const y = yScale(p.lat);
        const r = sizeScale(p.size);
        ctx.fillStyle = colorScale(p.group);
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    // Draw axes labels.
    ctx.fillStyle = chartColors.textSecondary;
    ctx.font = "11px system-ui, sans-serif";
    ctx.textAlign = "center";

    // X-axis (longitude).
    for (let i = 0; i <= 4; i++) {
      const x = margin.left + (width - margin.left - margin.right) * (i / 4);
      const val = lonExtent[0] + (lonExtent[1] - lonExtent[0]) * (i / 4);
      ctx.fillText(`${val.toFixed(1)}°`, x, height - margin.bottom + 18);
    }

    // Y-axis (latitude).
    ctx.textAlign = "right";
    for (let i = 0; i <= 4; i++) {
      const y = margin.top + (height - margin.top - margin.bottom) * (i / 4);
      const val = latExtent[1] - (latExtent[1] - latExtent[0]) * (i / 4);
      ctx.fillText(`${val.toFixed(1)}°`, margin.left - 8, y + 4);
    }

    // Legend for groups.
    if (groups.length > 1 && groups.length <= 12) {
      const legendX = width - margin.right - 120;
      let legendY = margin.top + 16;
      ctx.font = "11px system-ui, sans-serif";
      ctx.textAlign = "left";
      for (const group of groups.slice(0, 12)) {
        ctx.fillStyle = colorScale(group);
        ctx.beginPath();
        ctx.arc(legendX, legendY - 3, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = chartColors.text;
        ctx.fillText(group, legendX + 10, legendY);
        legendY += 16;
      }
    }
  }, [data, lonKey, latKey, sizeKey, groupKey, mode, t]);

  if (data.length === 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200, color: chartColors.textSecondary }}>
        No geographic data
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ width: "100%", height: "100%", minHeight: 300 }}>
      <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%" }} />
    </div>
  );
}
