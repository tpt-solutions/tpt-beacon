// SPDX-License-Identifier: MIT OR Apache-2.0
/**
 * Shared chart theming and configuration.
 */

export const chartColors = {
  primary: "#58a6ff",
  secondary: "#a371f7",
  success: "#3fb950",
  warning: "#d29922",
  danger: "#f85149",
  info: "#79c0ff",
  palette: [
    "#58a6ff",
    "#a371f7",
    "#3fb950",
    "#d29922",
    "#f85149",
    "#79c0ff",
    "#d2a8ff",
    "#56d364",
    "#e3b341",
    "#ff7b72",
    "#a5d6ff",
    "#bc8cff",
  ],
  background: "#0d1117",
  surface: "#161b22",
  border: "#30363d",
  text: "#c9d1d9",
  textSecondary: "#8b949e",
  textMuted: "#484f58",
};

export interface ChartTheme {
  width: number;
  height: number;
  margin: { top: number; right: number; bottom: number; left: number };
  colors: string[];
  background: string;
  text: string;
  textSecondary: string;
  gridColor: string;
}

export const defaultTheme: ChartTheme = {
  width: 600,
  height: 400,
  margin: { top: 20, right: 30, bottom: 50, left: 60 },
  colors: chartColors.palette,
  background: chartColors.background,
  text: chartColors.text,
  textSecondary: chartColors.textSecondary,
  gridColor: chartColors.border,
};

export interface ChartDataPoint {
  [key: string]: string | number;
}
