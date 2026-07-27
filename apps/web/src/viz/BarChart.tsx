// SPDX-License-Identifier: MIT OR Apache-2.0
import { useEffect, useRef } from "react";
import * as d3 from "d3";
import { defaultTheme, type ChartDataPoint, type ChartTheme } from "./theme";

interface BarChartProps {
  data: ChartDataPoint[];
  xKey: string;
  yKey: string;
  theme?: Partial<ChartTheme>;
  title?: string;
}

export function BarChart({ data, xKey, yKey, theme: overrides, title }: BarChartProps) {
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
      .padding(0.3);

    const y = d3
      .scaleLinear()
      .domain([0, d3.max(data, (d) => Number(d[yKey])) ?? 0])
      .nice()
      .range([innerH, 0]);

    // Grid lines
    g.append("g")
      .attr("class", "grid")
      .call(d3.axisLeft(y).tickSize(-innerW).tickFormat(() => ""))
      .selectAll("line")
      .attr("stroke", theme.gridColor)
      .attr("stroke-opacity", 0.3);

    g.selectAll(".grid .domain").remove();

    // Bars
    g.selectAll("rect.bar")
      .data(data)
      .join("rect")
      .attr("class", "bar")
      .attr("x", (d) => x(String(d[xKey])) ?? 0)
      .attr("width", x.bandwidth())
      .attr("y", innerH)
      .attr("height", 0)
      .attr("fill", (_, i) => theme.colors[i % theme.colors.length])
      .attr("rx", 3)
      .transition()
      .duration(600)
      .attr("y", (d) => y(Number(d[yKey])))
      .attr("height", (d) => innerH - y(Number(d[yKey])));

    // X axis
    g.append("g")
      .attr("transform", `translate(0,${innerH})`)
      .call(d3.axisBottom(x))
      .selectAll("text")
      .attr("fill", theme.textSecondary)
      .attr("font-size", "11px");

    g.selectAll(".domain").attr("stroke", theme.gridColor);

    // Y axis
    g.append("g")
      .call(d3.axisLeft(y).ticks(6))
      .selectAll("text")
      .attr("fill", theme.textSecondary)
      .attr("font-size", "11px");

    g.selectAll(".domain").attr("stroke", theme.gridColor);
  }, [data, xKey, yKey, theme, width, height, margin, innerW, innerH]);

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
