import { useEffect, useRef } from "react";
import * as d3 from "d3";
import { defaultTheme, type ChartDataPoint, type ChartTheme } from "./theme";

interface LineChartProps {
  data: ChartDataPoint[];
  xKey: string;
  yKey: string;
  theme?: Partial<ChartTheme>;
  title?: string;
}

export function LineChart({ data, xKey, yKey, theme: overrides, title }: LineChartProps) {
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
      .scalePoint()
      .domain(data.map((d) => String(d[xKey])))
      .range([0, innerW]);

    const y = d3
      .scaleLinear()
      .domain([0, d3.max(data, (d) => Number(d[yKey])) ?? 0])
      .nice()
      .range([innerH, 0]);

    // Grid
    g.append("g")
      .call(d3.axisLeft(y).tickSize(-innerW).tickFormat(() => ""))
      .selectAll("line")
      .attr("stroke", theme.gridColor)
      .attr("stroke-opacity", 0.3);
    g.selectAll(".domain").remove();

    // Area fill
    const area = d3
      .area<ChartDataPoint>()
      .x((d) => x(String(d[xKey])) ?? 0)
      .y0(innerH)
      .y1((d) => y(Number(d[yKey])));

    g.append("path")
      .datum(data)
      .attr("fill", theme.colors[0])
      .attr("fill-opacity", 0.1)
      .attr("d", area);

    // Line
    const line = d3
      .line<ChartDataPoint>()
      .x((d) => x(String(d[xKey])) ?? 0)
      .y((d) => y(Number(d[yKey])))
      .curve(d3.curveMonotoneX);

    const path = g
      .append("path")
      .datum(data)
      .attr("fill", "none")
      .attr("stroke", theme.colors[0])
      .attr("stroke-width", 2)
      .attr("d", line);

    // Animate line drawing
    const totalLength = path.node()?.getTotalLength() ?? 0;
    path
      .attr("stroke-dasharray", `${totalLength} ${totalLength}`)
      .attr("stroke-dashoffset", totalLength)
      .transition()
      .duration(800)
      .attr("stroke-dashoffset", 0);

    // Dots
    g.selectAll("circle")
      .data(data)
      .join("circle")
      .attr("cx", (d) => x(String(d[xKey])) ?? 0)
      .attr("cy", (d) => y(Number(d[yKey])))
      .attr("r", 3)
      .attr("fill", theme.colors[0]);

    // Axes
    g.append("g")
      .attr("transform", `translate(0,${innerH})`)
      .call(d3.axisBottom(x))
      .selectAll("text")
      .attr("fill", theme.textSecondary)
      .attr("font-size", "11px");

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
