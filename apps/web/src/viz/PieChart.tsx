// SPDX-License-Identifier: MIT OR Apache-2.0
import { useEffect, useRef } from "react";
import * as d3 from "d3";
import { defaultTheme, type ChartDataPoint, type ChartTheme } from "./theme";

interface PieChartProps {
  data: ChartDataPoint[];
  labelKey: string;
  valueKey: string;
  theme?: Partial<ChartTheme>;
  title?: string;
  donut?: boolean;
}

export function PieChart({
  data,
  labelKey,
  valueKey,
  theme: overrides,
  title,
  donut = false,
}: PieChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const theme = { ...defaultTheme, ...overrides };
  const size = Math.min(theme.width, theme.height);
  const radius = size / 2 - theme.margin.top;

  useEffect(() => {
    if (!svgRef.current || data.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const g = svg
      .attr("width", size)
      .attr("height", size)
      .append("g")
      .attr("transform", `translate(${size / 2},${size / 2})`);

    const pie = d3
      .pie<ChartDataPoint>()
      .value((d) => Number(d[valueKey]))
      .sort(null);

    const arc = d3.arc<d3.PieArcDatum<ChartDataPoint>>().innerRadius(donut ? radius * 0.5 : 0).outerRadius(radius);

    g
      .selectAll("path")
      .data(pie(data))
      .join("path")
      .attr("fill", (_, i) => theme.colors[i % theme.colors.length])
      .attr("stroke", theme.background)
      .attr("stroke-width", 1)
      .transition()
      .duration(600)
      .attrTween("d", function (d) {
        const i = d3.interpolate({ startAngle: 0, endAngle: 0 }, d);
        return (t) => arc(i(t)) ?? "";
      });

    // Labels for donut charts with enough space
    if (donut && radius > 60) {
      g.selectAll("text")
        .data(pie(data))
        .join("text")
        .attr("transform", (d) => {
          const [x, y] = arc.centroid(d);
          return `translate(${x},${y})`;
        })
        .attr("text-anchor", "middle")
        .attr("font-size", "10px")
        .attr("fill", theme.text)
        .text((d) => String(d.data[labelKey]));
    }

    // Legend
    const legend = svg
      .append("g")
      .attr("transform", `translate(${size + 10}, ${theme.margin.top})`);

    data.forEach((d, i) => {
      const row = legend
        .append("g")
        .attr("transform", `translate(0,${i * 18})`);
      row.append("rect").attr("width", 12).attr("height", 12).attr("fill", theme.colors[i % theme.colors.length]).attr("rx", 2);
      row
        .append("text")
        .attr("x", 16)
        .attr("y", 10)
        .attr("font-size", "11px")
        .attr("fill", theme.textSecondary)
        .text(String(d[labelKey]));
    });
  }, [data, labelKey, valueKey, theme, size, radius, donut]);

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
