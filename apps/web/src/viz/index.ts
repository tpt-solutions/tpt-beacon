/**
 * TPT Beacon Visualization Library.
 *
 * Core chart components built with D3.js:
 * - BarChart: vertical bar chart
 * - LineChart: line chart with area fill
 * - PieChart / DonutChart: pie/donut chart (set `donut` prop)
 * - ScatterChart: scatter plot
 * - AreaChart: multi-series area chart
 * - Heatmap: color-encoded grid
 */

export { BarChart } from "./BarChart";
export { LineChart } from "./LineChart";
export { PieChart } from "./PieChart";
export { ScatterChart } from "./ScatterChart";
export { AreaChart } from "./AreaChart";
export { Heatmap } from "./Heatmap";
export { chartColors, defaultTheme } from "./theme";
export type { ChartDataPoint, ChartTheme } from "./theme";
