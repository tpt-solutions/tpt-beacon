// SPDX-License-Identifier: MIT OR Apache-2.0
/**
 * Export utilities for dashboards.
 */

/**
 * Export a DOM element to PNG using html2canvas.
 * Falls back to a blob URL if html2canvas is not available.
 */
export async function exportToPng(
  element: HTMLElement,
  filename = "dashboard.png",
): Promise<void> {
  // Dynamic import of html2canvas (not bundled by default).
  let html2canvas: (el: HTMLElement, opts?: Record<string, unknown>) => Promise<HTMLCanvasElement>;
  try {
    html2canvas = (await import("html2canvas")).default as typeof html2canvas;
  } catch {
    throw new Error(
      "html2canvas is required for PNG export. Install it with: npm install html2canvas",
    );
  }

  const canvas = await html2canvas(element, {
    backgroundColor: "#0d1117",
    scale: 2, // Retina quality
    useCORS: true,
    logging: false,
  });

  const link = document.createElement("a");
  link.download = filename;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

/**
 * Export a DOM element to a data URL (for embedding/sharing).
 */
export async function exportToDataURL(
  element: HTMLElement,
): Promise<string> {
  let html2canvas: (el: HTMLElement, opts?: Record<string, unknown>) => Promise<HTMLCanvasElement>;
  try {
    html2canvas = (await import("html2canvas")).default as typeof html2canvas;
  } catch {
    throw new Error("html2canvas is required for PNG export.");
  }

  const canvas = await html2canvas(element, {
    backgroundColor: "#0d1117",
    scale: 2,
    useCORS: true,
    logging: false,
  });

  return canvas.toDataURL("image/png");
}
