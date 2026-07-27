// SPDX-License-Identifier: MIT OR Apache-2.0
/**
 * Custom visualization plugin API.
 *
 * Register custom chart types that render against a query result shape.
 * Plugins can be registered at runtime and will appear in the widget type picker.
 */

import type { ChartDataPoint } from "./theme";
import type { ReactNode } from "react";

export interface VizPluginContext {
  /** The query result data. */
  data: ChartDataPoint[];
  /** Column names from the query. */
  columns: string[];
  /** Widget width in pixels. */
  width: number;
  /** Widget height in pixels. */
  height: number;
}

export interface VizPlugin {
  /** Unique type identifier (e.g., "my_custom_chart"). */
  type: string;
  /** Human-readable name (e.g., "My Custom Chart"). */
  name: string;
  /** Optional description. */
  description?: string;
  /** Category for grouping in the picker. */
  category?: string;
  /** Icon (emoji or unicode char). */
  icon?: string;
  /** Render function. */
  render: (ctx: VizPluginContext) => ReactNode;
  /** Optional: validate that data is compatible with this plugin. */
  validate?: (columns: string[]) => boolean;
}

const registry = new Map<string, VizPlugin>();

/**
 * Register a custom visualization plugin.
 */
export function registerVizPlugin(plugin: VizPlugin): void {
  if (registry.has(plugin.type)) {
    console.warn(`VizPlugin "${plugin.type}" already registered, overwriting.`);
  }
  registry.set(plugin.type, plugin);
}

/**
 * Unregister a visualization plugin.
 */
export function unregisterVizPlugin(type: string): boolean {
  return registry.delete(type);
}

/**
 * Get a registered plugin by type.
 */
export function getVizPlugin(type: string): VizPlugin | undefined {
  return registry.get(type);
}

/**
 * List all registered plugins.
 */
export function listVizPlugins(): VizPlugin[] {
  return Array.from(registry.values());
}

/**
 * Get all registered plugin types (for the widget type picker).
 */
export function getVizPluginTypes(): string[] {
  return Array.from(registry.keys());
}

/**
 * Find compatible plugins for a given column set.
 */
export function findCompatiblePlugins(columns: string[]): VizPlugin[] {
  return Array.from(registry.values()).filter((p) =>
    p.validate ? p.validate(columns) : true,
  );
}
