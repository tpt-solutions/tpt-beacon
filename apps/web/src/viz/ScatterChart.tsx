// SPDX-License-Identifier: MIT OR Apache-2.0
import { useEffect, useRef } from "react";
import * as d3 from "d3";
import { defaultTheme, type ChartDataPoint, type ChartTheme } from "./theme";

interface ScatterChartProps {
  data: ChartDataPoint[];
  xKey: string;
  yKey: string;
  colorKey?: string;
  sizeKey?: string;
  theme?: Partial<ChartTheme>;
  title?: string;
}

export function ScatterChart({
  data,
  xKey,
  yKey,
  colorKey,
  theme: overrides,
  title,
}: ScatterChartProps) {
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
      .scaleLinear()
      .domain(d3.extent(data, (d) => Number(d[xKey])) as [number, number])
      .nice()
      .range([0, innerW]);

    const y = d3
      .scaleLinear()
      .domain(d3.extent(data, (d) => Number(d[yKey])) as [number, number])
      .nice()
      .range([innerH, 0]);

    // Grid
    g.append("g")
      .call(d3.axisLeft(y).tickSize(-innerW).tickFormat(() => ""))
      .selectAll("line")
      .attr("stroke", theme.gridColor)
      .attr("stroke-opacity", 0.3);
    g.selectAll(".domain").remove();

    // Points
    g.selectAll("circle")
      .data(data)
      .join("circle")
      .attr("cx", (d) => x(Number(d[xKey])))
      .attr("cy", (d) => y(Number(d[yKey])))
      .attr("r", 0)
      .attr("fill", (d, i) =>
        colorKey ? theme.colors[Number(d[colorKey]) % theme.colors.length] : theme.colors[i % theme.colors.length],
      )
      .attr("fill-opacity", 0.7)
      .attr("stroke", theme.background)
      .attr("stroke-width", 0.5)
      .transition()
      .duration(600)
      .attr("r", 4);

    // Axes
    g.append("g")
      .attr("transform", `translate(0,${innerH})`)
      .call(d3.axisBottom(x).ticks(6))
      .selectAll("text")
      .attr("fill", theme.textSecondary)
      .attr("font-size", "11px");

    g.append("g")
      .call(d3.axisLeft(y).ticks(6))
      .selectAll("text")
      .attr("fill", theme.textSecondary)
      .attr("font-size", "11px");

    g.selectAll(".domain").attr("stroke", theme.gridColor);
  }, [data, xKey, yKey, colorKey, theme, width, height, margin, innerW, innerH]);

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
