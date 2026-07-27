// SPDX-License-Identifier: MIT OR Apache-2.0
/**
 * Chronos time-series chart component.
 *
 * Enhanced line chart with downsampling, interpolation, and zoom/pan.
 * Optimized for time-series data from Chronos queries.
 */

import { useEffect, useRef, useMemo, useState, useCallback } from "react";
import * as d3 from "d3";
import { defaultTheme, chartColors, type ChartTheme, type ChartDataPoint } from "./theme";

export interface ChronosTimeSeriesProps {
  data: ChartDataPoint[];
  /** Column for the time/x axis. */
  timeKey: string;
  /** Column(s) for the y axis. */
  yKeys: string[];
  /** Downsample to at most N points (default: 500). */
  downsampleTo?: number;
  /** Interpolation method. */
  interpolation?: "linear" | "monotone" | "step" | "basis";
  /** Enable zoom/pan. */
  zoom?: boolean;
  theme?: Partial<ChartTheme>;
}

/** Largest-Triangle-Three-Buckets downsampling. */
function downsampleLTTB(data: ChartDataPoint[], timeKey: string, yKey: string, target: number): ChartDataPoint[] {
  if (data.length <= target) return data;
  const result: ChartDataPoint[] = [data[0]];
  const bucketSize = (data.length - 2) / (target - 2);

  let a = 0;
  for (let i = 0; i < target - 2; i++) {
    const rangeStart = Math.floor((i + 1) * bucketSize) + 1;
    const rangeEnd = Math.min(Math.floor((i + 2) * bucketSize) + 1, data.length - 1);
    const nextRangeStart = Math.floor((i + 2) * bucketSize) + 1;
    const nextRangeEnd = Math.min(Math.floor((i + 3) * bucketSize) + 1, data.length);

    // Average of next bucket.
    let avgX = 0;
    let avgY = 0;
    const nextCount = nextRangeEnd - nextRangeStart;
    for (let j = nextRangeStart; j < nextRangeEnd; j++) {
      avgX += Number(data[j][timeKey]) || j;
      avgY += Number(data[j][yKey]) || 0;
    }
    if (nextCount > 0) {
      avgX /= nextCount;
      avgY /= nextCount;
    }

    // Find max triangle area in current bucket.
    let maxArea = -1;
    let maxIdx = rangeStart;
    const aX = Number(data[a][timeKey]) || a;
    const aY = Number(data[a][yKey]) || 0;

    for (let j = rangeStart; j < rangeEnd; j++) {
      const jX = Number(data[j][timeKey]) || j;
      const jY = Number(data[j][yKey]) || 0;
      const area = Math.abs((aX - avgX) * (jY - aY) - (aX - jX) * (avgY - aY)) * 0.5;
      if (area > maxArea) {
        maxArea = area;
        maxIdx = j;
      }
    }

    result.push(data[maxIdx]);
    a = maxIdx;
  }

  result.push(data[data.length - 1]);
  return result;
}

export function ChronosTimeSeries({
  data,
  timeKey,
  yKeys,
  downsampleTo = 500,
  interpolation = "monotone",
  zoom = true,
  theme: userTheme,
}: ChronosTimeSeriesProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const t = useMemo(() => ({ ...defaultTheme, ...userTheme }), [userTheme]);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panOffset, setPanOffset] = useState(0);

  // Downsample data for each yKey.
  const processedData = useMemo(() => {
    if (data.length <= downsampleTo) return data;
    // Downsample using the first yKey, keep all points.
    return downsampleLTTB(data, timeKey, yKeys[0], downsampleTo);
  }, [data, timeKey, yKeys, downsampleTo]);

  const handleZoomIn = useCallback(() => {
    setZoomLevel((z) => Math.min(z * 1.5, 10));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoomLevel((z) => Math.max(z / 1.5, 1));
  }, []);

  const handleReset = useCallback(() => {
    setZoomLevel(1);
    setPanOffset(0);
  }, []);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || processedData.length === 0) return;

    const { width, height } = svg.getBoundingClientRect();
    const margin = t.margin;
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    // Scales.
    const xScale = d3.scaleLinear().domain([0, processedData.length - 1]).range([0, innerW]);
    void xScale;

    // Apply zoom.
    const zoomedXScale = d3.scaleLinear()
      .domain([panOffset, panOffset + (processedData.length - 1) / zoomLevel])
      .range([0, innerW]);

    // Y domain across all yKeys.
    const allYValues = processedData.flatMap((d) => yKeys.map((k) => Number(d[k]) || 0));
    const yExtent = d3.extent(allYValues) as [number, number];
    const yPad = (yExtent[1] - yExtent[0]) * 0.1 || 1;
    const yScale = d3.scaleLinear()
      .domain([yExtent[0] - yPad, yExtent[1] + yPad])
      .range([innerH, 0]);

    // Interpolation.
    const interpFn = {
      linear: d3.curveLinear,
      monotone: d3.curveMonotoneX,
      step: d3.curveStep,
      basis: d3.curveBasis,
    }[interpolation];

    // Build SVG content.
    let svgContent = "";

    // Grid lines.
    svgContent += `<g class="grid">`;
    for (let i = 0; i <= 5; i++) {
      const y = innerH * (i / 5);
      svgContent += `<line x1="0" y1="${y}" x2="${innerW}" y2="${y}" stroke="${chartColors.border}" stroke-width="0.5"/>`;
    }
    svgContent += `</g>`;

    // Lines for each yKey.
    for (let ki = 0; ki < yKeys.length; ki++) {
      const k = yKeys[ki];
      const color = chartColors.palette[ki % chartColors.palette.length];

      const lineGen = d3.line<ChartDataPoint>()
        .x((_, i) => zoomedXScale(i))
        .y((d) => yScale(Number(d[k]) || 0))
        .curve(interpFn);

      const pathData = lineGen(processedData);
      if (pathData) {
        svgContent += `<path d="${pathData}" fill="none" stroke="${color}" stroke-width="2" opacity="0.9"/>`;

        // Area fill.
        const areaGen = d3.area<ChartDataPoint>()
          .x((_, i) => zoomedXScale(i))
          .y0(innerH)
          .y1((d) => yScale(Number(d[k]) || 0))
          .curve(interpFn);

        const areaData = areaGen(processedData);
        if (areaData) {
          svgContent += `<path d="${areaData}" fill="${color}" opacity="0.05"/>`;
        }
      }
    }

    // Axes.
    svgContent += `<g class="x-axis" transform="translate(0,${innerH})">`;
    for (let i = 0; i <= 6; i++) {
      const x = innerW * (i / 6);
      const idx = Math.round(panOffset + ((processedData.length - 1) / zoomLevel) * (i / 6));
      if (idx >= 0 && idx < processedData.length) {
        const ts = new Date(String(processedData[idx][timeKey]));
        const label = `${ts.getMonth() + 1}/${ts.getDate()}`;
        svgContent += `<text x="${x}" y="20" text-anchor="middle" fill="${chartColors.textSecondary}" font-size="10">${label}</text>`;
      }
    }
    svgContent += `</g>`;

    svgContent += `<g class="y-axis">`;
    for (let i = 0; i <= 5; i++) {
      const y = innerH * (i / 5);
      const val = yScale.invert(y);
      svgContent += `<text x="-8" y="${y + 4}" text-anchor="end" fill="${chartColors.textSecondary}" font-size="10">${val.toFixed(0)}</text>`;
    }
    svgContent += `</g>`;

    svg.innerHTML = svgContent;
  }, [processedData, timeKey, yKeys, zoomLevel, panOffset, interpolation, t]);

  // Wheel zoom.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !zoom) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.deltaY < 0) {
        setZoomLevel((z) => Math.min(z * 1.2, 10));
      } else {
        setZoomLevel((z) => Math.max(z / 1.2, 1));
      }
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [zoom]);

  if (data.length === 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200, color: chartColors.textSecondary }}>
        No time-series data
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ width: "100%", height: "100%", position: "relative" }}>
      <svg
        ref={svgRef}
        style={{ width: "100%", height: "100%" }}
        viewBox={`0 0 ${t.width} ${t.height}`}
        preserveAspectRatio="xMidYMid meet"
      />
      {zoom && (
        <div style={{ position: "absolute", top: 8, right: 8, display: "flex", gap: 4 }}>
          <button onClick={handleZoomIn} style={zoomBtnStyle}>+</button>
          <button onClick={handleZoomOut} style={zoomBtnStyle}>-</button>
          <button onClick={handleReset} style={zoomBtnStyle}>Reset</button>
        </div>
      )}
    </div>
  );
}

const zoomBtnStyle: React.CSSProperties = {
  background: chartColors.surface,
  border: `1px solid ${chartColors.border}`,
  borderRadius: 4,
  color: chartColors.text,
  cursor: "pointer",
  fontSize: "0.75rem",
  padding: "2px 8px",
};
