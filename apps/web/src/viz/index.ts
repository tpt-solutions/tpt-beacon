// SPDX-License-Identifier: MIT OR Apache-2.0
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
 * - MeridianMap: geographic point/cluster/heatmap visualization
 * - PlexusGraph: force-directed graph layout
 * - PrismVector: ranked vector search results with score bars
 * - ChronosTimeSeries: time-series with downsampling, interpolation, zoom/pan
 */

export { BarChart } from "./BarChart";
export { LineChart } from "./LineChart";
export { PieChart } from "./PieChart";
export { ScatterChart } from "./ScatterChart";
export { AreaChart } from "./AreaChart";
export { Heatmap } from "./Heatmap";
export { MeridianMap } from "./MeridianMap";
export { PlexusGraph } from "./PlexusGraph";
export { PrismVector } from "./PrismVector";
export { ChronosTimeSeries } from "./ChronosTimeSeries";
export { chartColors, defaultTheme } from "./theme";
export type { ChartDataPoint, ChartTheme } from "./theme";
