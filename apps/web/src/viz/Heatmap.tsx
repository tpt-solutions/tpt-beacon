// SPDX-License-Identifier: MIT OR Apache-2.0
import { useEffect, useRef } from "react";
import * as d3 from "d3";
import { defaultTheme, type ChartDataPoint, type ChartTheme } from "./theme";

interface HeatmapProps {
  data: ChartDataPoint[];
  xKey: string;
  yKey: string;
  valueKey: string;
  theme?: Partial<ChartTheme>;
  title?: string;
}

export function Heatmap({ data, xKey, yKey, valueKey, theme: overrides, title }: HeatmapProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const theme = { ...defaultTheme, ...overrides };
  const { width, height, margin } = theme;
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  useEffect(() => {
    if (!svgRef.current || data.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const g = svg
      .attr("width", width)
      .attr("height", height)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const x = d3
      .scaleBand()
      .domain(data.map((d) => String(d[xKey])))
      .range([0, innerW])
      .padding(0.05);

    const y = d3
      .scaleBand()
      .domain(data.map((d) => String(d[yKey])))
      .range([0, innerH])
      .padding(0.05);

    const colorScale = d3
      .scaleSequential(d3.interpolateViridis)
      .domain([0, d3.max(data, (d) => Number(d[valueKey])) ?? 1]);

    g.selectAll("rect")
      .data(data)
      .join("rect")
      .attr("x", (d) => x(String(d[xKey])) ?? 0)
      .attr("y", (d) => y(String(d[yKey])) ?? 0)
      .attr("width", x.bandwidth())
      .attr("height", y.bandwidth())
      .attr("fill", (d) => colorScale(Number(d[valueKey])))
      .attr("rx", 2);

    // Axes
    g.append("g")
      .attr("transform", `translate(0,${innerH})`)
      .call(d3.axisBottom(x).tickSize(0))
      .selectAll("text")
      .attr("fill", theme.textSecondary)
      .attr("font-size", "10px")
      .attr("transform", "rotate(-45)")
      .attr("text-anchor", "end");

    g.append("g")
      .call(d3.axisLeft(y).tickSize(0))
      .selectAll("text")
      .attr("fill", theme.textSecondary)
      .attr("font-size", "10px");

    g.selectAll(".domain").remove();
  }, [data, xKey, yKey, valueKey, theme, width, height, margin, innerW, innerH]);

  return (
    <div style={{ background: theme.background, borderRadius: 6, padding: "0.5rem" }}>
      {title && (
        <h4
          style={{
            margin: "0 0 0.25rem",
            fontSize: "0.85rem",
            color: theme.textSecondary,
            textAlign: "center",
          }}
        >
          {title}
        </h4>
      )}
      <svg ref={svgRef} style={{ display: "block", margin: "0 auto" }} />
    </div>
  );
}
