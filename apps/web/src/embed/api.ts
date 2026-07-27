// SPDX-License-Identifier: MIT OR Apache-2.0
/**
 * Embed API client — create and validate embed tokens.
 */

import { getToken } from "../auth";

const BASE = "/api/embed";

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface EmbedToken {
  id: string;
  dashboard_id: string;
  expires_at: string;
  embed_url: string;
}

export interface EmbedValidation {
  valid: boolean;
  dashboard_id: string;
  row_filter: Record<string, unknown> | null;
  theme: Record<string, string> | null;
  permissions: string[];
}

export async function createEmbedToken(
  dashboardId: string,
  options?: {
    permissions?: string[];
    rowFilter?: Record<string, unknown>;
    theme?: Record<string, string>;
    expiresInHours?: number;
  },
): Promise<EmbedToken | null> {
  const res = await fetch(`${BASE}/tokens`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({
      dashboard_id: dashboardId,
      permissions: options?.permissions ?? ["view"],
      row_filter: options?.rowFilter ?? null,
      theme: options?.theme ?? null,
      expires_in_hours: options?.expiresInHours ?? 24,
    }),
  });
  if (!res.ok) return null;
  return res.json();
}

export async function validateEmbedToken(
  tokenId: string,
): Promise<EmbedValidation | null> {
  const res = await fetch(`${BASE}/tokens/${tokenId}/validate`);
  if (!res.ok) return null;
  return res.json();
}
