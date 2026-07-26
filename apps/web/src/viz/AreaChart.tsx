import { useEffect, useRef } from "react";
import * as d3 from "d3";
import { defaultTheme, type ChartDataPoint, type ChartTheme } from "./theme";

interface AreaChartProps {
  data: ChartDataPoint[];
  xKey: string;
  yKeys: string[];
  theme?: Partial<ChartTheme>;
  title?: string;
}

export function AreaChart({ data, xKey, yKeys, theme: overrides, title }: AreaChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const theme = { ...defaultTheme, ...overrides };
  const { width, height, margin } = theme;
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  useEffect(() => {
    if (!svgRef.current || data.length === 0 || yKeys.length === 0) return;

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

    const yMax = d3.max(data, (d) => d3.max(yKeys, (k) => Number(d[k]))) ?? 0;
    const y = d3.scaleLinear().domain([0, yMax]).nice().range([innerH, 0]);

    // Grid
    g.append("g")
      .call(d3.axisLeft(y).tickSize(-innerW).tickFormat(() => ""))
      .selectAll("line")
      .attr("stroke", theme.gridColor)
      .attr("stroke-opacity", 0.3);
    g.selectAll(".domain").remove();

    // Stacked areas
    yKeys.forEach((key, i) => {
      const area = d3
        .area<ChartDataPoint>()
        .x((d) => x(String(d[xKey])) ?? 0)
        .y0(innerH)
        .y1((d) => y(Number(d[key])));

      g.append("path")
        .datum(data)
        .attr("fill", theme.colors[i % theme.colors.length])
        .attr("fill-opacity", 0.2)
        .attr("d", area);

      const line = d3
        .line<ChartDataPoint>()
        .x((d) => x(String(d[xKey])) ?? 0)
        .y((d) => y(Number(d[key])))
        .curve(d3.curveMonotoneX);

      g.append("path")
        .datum(data)
        .attr("fill", "none")
        .attr("stroke", theme.colors[i % theme.colors.length])
        .attr("stroke-width", 2)
        .attr("d", line);
    });

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

    // Legend
    if (yKeys.length > 1) {
      const legend = g.append("g").attr("transform", `translate(${innerW - 100}, 0)`);
      yKeys.forEach((key, i) => {
        const row = legend.append("g").attr("transform", `translate(0,${i * 16})`);
        row.append("rect").attr("width", 12).attr("height", 12).attr("fill", theme.colors[i]).attr("rx", 2);
        row.append("text").attr("x", 16).attr("y", 10).attr("font-size", "10px").attr("fill", theme.textSecondary).text(key);
      });
    }
  }, [data, xKey, yKeys, theme, width, height, margin, innerW, innerH]);

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
