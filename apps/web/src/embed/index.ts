/**
 * TPT Beacon Embed SDK
 *
 * Provides a JS snippet + iframe embed for dashboards and widgets.
 * Usage:
 *   <script src="/beacon-embed.js"></script>
 *   <script>
 *     BeaconEmbed.init({
 *       url: 'https://beacon.example.com',
 *       token: 'embed_xyz...',
 *       container: '#dashboard-embed',
 *       dashboardId: 'dash_123',
 *       theme: { primary: '#58a6ff' },
 *       height: 600,
 *     });
 *   </script>
 */

export interface BeaconEmbedConfig {
  /** Base URL of the Beacon instance. */
  url: string;
  /** Scoped, short-lived embed token. */
  token: string;
  /** CSS selector or DOM element to render into. */
  container: string | HTMLElement;
  /** Dashboard ID to embed. */
  dashboardId?: string;
  /** Widget ID to embed (if embedding a single widget). */
  widgetId?: string;
  /** Theme overrides. */
  theme?: Record<string, string>;
  /** Height of the iframe (default: 600). */
  height?: number;
  /** Width of the iframe (default: '100%'). */
  width?: string;
  /** Row-level filter passed at embed time. */
  rowFilter?: Record<string, unknown>;
  /** Called when the iframe loads. */
  onLoad?: () => void;
  /** Called on errors. */
  onError?: (error: Error) => void;
}

export interface BeaconEmbedInstance {
  /** Update the embedded dashboard (e.g. change filters). */
  update: (opts: Partial<BeaconEmbedConfig>) => void;
  /** Remove the iframe from the DOM. */
  destroy: () => void;
  /** Get the underlying iframe element. */
  getFrame: () => HTMLIFrameElement;
}

/**
 * Initialize a Beacon embed. Returns an instance for lifecycle management.
 */
export function init(config: BeaconEmbedConfig): BeaconEmbedInstance {
  const container =
    typeof config.container === "string"
      ? document.querySelector<HTMLElement>(config.container)
      : config.container;

  if (!container) {
    throw new Error(`BeaconEmbed: container not found: ${config.container}`);
  }

  const iframe = document.createElement("iframe");
  iframe.style.width = config.width ?? "100%";
  iframe.style.height = `${config.height ?? 600}px`;
  iframe.style.border = "none";
  iframe.style.borderRadius = "8px";
  iframe.style.background = "#0d1117";
  iframe.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms");
  iframe.setAttribute("loading", "lazy");

  // Build embed URL.
  const embedUrl = buildEmbedUrl(config);
  iframe.src = embedUrl;

  // Post theme and filters via postMessage for runtime updates.
  iframe.onload = () => {
    if (config.theme) {
      iframe.contentWindow?.postMessage(
        { type: "beacon:theme", theme: config.theme },
        config.url,
      );
    }
    if (config.rowFilter) {
      iframe.contentWindow?.postMessage(
        { type: "beacon:filter", filter: config.rowFilter },
        config.url,
      );
    }
    config.onLoad?.();
  };

  container.appendChild(iframe);

  return {
    update: (opts: Partial<BeaconEmbedConfig>) => {
      if (opts.theme) {
        iframe.contentWindow?.postMessage(
          { type: "beacon:theme", theme: opts.theme },
          config.url,
        );
      }
      if (opts.rowFilter) {
        iframe.contentWindow?.postMessage(
          { type: "beacon:filter", filter: opts.rowFilter },
          config.url,
        );
      }
      if (opts.height) {
        iframe.style.height = `${opts.height}px`;
      }
    },
    destroy: () => {
      iframe.remove();
    },
    getFrame: () => iframe,
  };
}

function buildEmbedUrl(config: BeaconEmbedConfig): string {
  const base = config.url.replace(/\/+$/, "");
  const params = new URLSearchParams();
  params.set("embed", "1");
  params.set("token", config.token);
  if (config.dashboardId) params.set("dashboard", config.dashboardId);
  if (config.widgetId) params.set("widget", config.widgetId);
  return `${base}/embed?${params.toString()}`;
}

// ── UMD/global export ──────────────────────────────────────────

declare global {
  interface Window {
    BeaconEmbed?: { init: typeof init };
  }
}

if (typeof window !== "undefined") {
  window.BeaconEmbed = { init };
}
