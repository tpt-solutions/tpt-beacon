import { useMemo, useState, useCallback } from "react";
import type { DashboardWidget } from "../dashboard/types";
import type { CdcEvent } from "../hooks/useFluxSubscription";
import { useFluxSubscription } from "../hooks/useFluxSubscription";
import { BarChart } from "../viz/BarChart";
import { LineChart } from "../viz/LineChart";
import { PieChart } from "../viz/PieChart";
import { ScatterChart } from "../viz/ScatterChart";
import { AreaChart } from "../viz/AreaChart";
import { Heatmap } from "../viz/Heatmap";
import { ResultsTable } from "./ResultsTable";
import type { ChartDataPoint, ChartTheme } from "../viz/theme";

interface DashboardWidgetRendererProps {
  widget: DashboardWidget;
  realtime?: boolean;
}

export function DashboardWidgetRenderer({
  widget,
  realtime = false,
}: DashboardWidgetRendererProps) {
  const { type, config } = widget;
  const [liveRows, setLiveRows] = useState<Record<string, unknown>[]>([]);

  const tableName = widget.query?.source ?? widget.query_id ?? null;
  const handleEvent = useCallback((event: CdcEvent) => {
    setLiveRows((prev) => [...prev.slice(-199), event.data]);
  }, []);

  const { state: wsState } = useFluxSubscription({
    table: tableName ?? "",
    enabled: realtime && !!tableName,
    onEvent: handleEvent,
  });

  const data: ChartDataPoint[] = useMemo(() => {
    const raw = liveRows.length > 0 ? liveRows : getPlaceholderData(type, config);
    return raw.map((row) => {
      const out: Record<string, string | number> = {};
      for (const [k, v] of Object.entries(row)) {
        out[k] = typeof v === "number" || typeof v === "string" ? v : String(v ?? "");
      }
      return out;
    });
  }, [liveRows, type, config]);

  const keys = useMemo(() => extractKeys(data), [data]);

  const xKey = config.xKey ?? keys[0] ?? "x";
  const yKey = config.yKey ?? keys[1] ?? "y";
  const yKeys = config.yKeys ?? [yKey];
  const labelKey = config.labelKey ?? keys[0] ?? "label";
  const valueKey = config.valueKey ?? keys[1] ?? "value";

  const compactTheme: Partial<ChartTheme> = { width: 400, height: 220 };

  const liveIndicator = realtime && tableName ? (
    <span
      style={{
        fontSize: "0.6rem",
        marginLeft: "0.4rem",
        padding: "0 0.3rem",
        borderRadius: 3,
        background: wsState === "connected" ? "#1a4b2e" : "#3d1a1a",
        color: wsState === "connected" ? "#3fb950" : "#f85149",
      }}
    >
      {wsState === "connected" ? "LIVE" : wsState === "connecting" ? "..." : "OFF"}
    </span>
  ) : null;

  switch (type) {
    case "kpi":
      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
          }}
        >
          {liveIndicator}
          <span style={{ fontSize: "2rem", fontWeight: 700, color: "#58a6ff" }}>
            {config.kpiValue ?? data[0]?.[valueKey] ?? "--"}
          </span>
          <span style={{ fontSize: "0.75rem", color: "#8b949e", marginTop: "0.25rem" }}>
            {config.kpiFormat ?? "number"}
          </span>
          {config.kpiTrend && (
            <span
              style={{
                fontSize: "0.75rem",
                color:
                  config.kpiTrend === "up"
                    ? "#3fb950"
                    : config.kpiTrend === "down"
                      ? "#f85149"
                      : "#8b949e",
                marginTop: "0.25rem",
              }}
            >
              {config.kpiTrend === "up" ? "\u25B2" : config.kpiTrend === "down" ? "\u25BC" : "\u2500"} trend
            </span>
          )}
        </div>
      );

    case "bar_chart":
      return (
        <div style={{ height: "100%", position: "relative" }}>
          {liveIndicator}
          <BarChart data={data} xKey={xKey} yKey={yKey} theme={compactTheme} />
        </div>
      );

    case "line_chart":
      return (
        <div style={{ height: "100%", position: "relative" }}>
          {liveIndicator}
          <LineChart data={data} xKey={xKey} yKey={yKey} theme={compactTheme} />
        </div>
      );

    case "pie_chart":
      return (
        <div style={{ height: "100%", position: "relative" }}>
          {liveIndicator}
          <PieChart
            data={data}
            labelKey={labelKey}
            valueKey={valueKey}
            donut={config.donut}
            theme={compactTheme}
          />
        </div>
      );

    case "scatter_chart":
      return (
        <div style={{ height: "100%", position: "relative" }}>
          {liveIndicator}
          <ScatterChart data={data} xKey={xKey} yKey={yKey} theme={compactTheme} />
        </div>
      );

    case "area_chart":
      return (
        <div style={{ height: "100%", position: "relative" }}>
          {liveIndicator}
          <AreaChart data={data} xKey={xKey} yKeys={yKeys} theme={compactTheme} />
        </div>
      );

    case "heatmap":
      return (
        <div style={{ height: "100%", position: "relative" }}>
          {liveIndicator}
          <Heatmap data={data} xKey={xKey} yKey={yKey} valueKey={valueKey} theme={compactTheme} />
        </div>
      );

    case "table":
      return (
        <div style={{ height: "100%", overflow: "auto", position: "relative" }}>
          {liveIndicator}
          {data.length > 0 ? (
            <ResultsTable
              columns={keys.map((k) => ({ name: k, type: "text" }))}
              rows={data}
            />
          ) : (
            <p style={{ fontSize: "0.75rem", color: "#8b949e", padding: "0.5rem" }}>
              Table widget — connect to a query to display data.
            </p>
          )}
        </div>
      );

    default:
      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            color: "#484f58",
            fontSize: "0.8rem",
          }}
        >
          {liveIndicator}
          <span style={{ fontSize: "1.5rem", marginBottom: "0.25rem" }}>
            {type === "bar_chart"
              ? "\u2587\u2585\u2583\u2587\u2581"
              : type === "line_chart"
                ? "\u2571\u2572\u2571"
                : type === "pie_chart"
                  ? "\u25CB"
                  : type === "scatter_chart"
                    ? "\u2726 \u2727 \u2726"
                    : type === "area_chart"
                      ? "\u2580\u2584\u2588"
                      : "\u25A3"}
          </span>
          <span>{widget.title}</span>
          <span style={{ fontSize: "0.7rem", marginTop: "0.25rem" }}>
            {config.xKey ? `x: ${config.xKey}` : "Configure keys in widget settings"}
          </span>
        </div>
      );
  }
}

/** Generate placeholder data for chart preview. */
function getPlaceholderData(
  type: string,
  config: { xKey?: string; yKey?: string; labelKey?: string; valueKey?: string },
): Record<string, unknown>[] {
  const xKey = config.xKey ?? "category";
  const yKey = config.yKey ?? "value";
  const labelKey = config.labelKey ?? "label";
  const valueKey = config.valueKey ?? "value";

  if (type === "pie_chart") {
    return [
      { [labelKey]: "Alpha", [valueKey]: 30 },
      { [labelKey]: "Beta", [valueKey]: 50 },
      { [labelKey]: "Gamma", [valueKey]: 20 },
    ];
  }
  return [
    { [xKey]: "Jan", [yKey]: 120 },
    { [xKey]: "Feb", [yKey]: 200 },
    { [xKey]: "Mar", [yKey]: 150 },
    { [xKey]: "Apr", [yKey]: 280 },
    { [xKey]: "May", [yKey]: 220 },
    { [xKey]: "Jun", [yKey]: 310 },
  ];
}

/** Extract all keys from the first row of data. */
function extractKeys(data: ChartDataPoint[]): string[] {
  if (data.length === 0) return [];
  return Object.keys(data[0]);
}
