/**
 * React hook for real-time Flux WebSocket subscriptions.
 * Handles connection, reconnection with exponential backoff, and event dispatch.
 */

import { useEffect, useRef, useCallback, useState } from "react";
import type { QueryRequest } from "../types";

export interface CdcEvent {
  event_type: "insert" | "update" | "delete";
  table: string;
  data: Record<string, unknown>;
  offset?: number;
}

interface UseFluxSubscriptionOptions {
  table: string;
  consumer_group?: string;
  enabled?: boolean;
  /** Maximum reconnect attempts before giving up (default: Infinity). */
  maxRetries?: number;
  /** Base delay in ms for exponential backoff (default: 1000). */
  baseDelayMs?: number;
  /** Callback invoked when a new CDC event arrives. */
  onEvent?: (event: CdcEvent) => void;
  /** Callback invoked when the connection state changes. */
  onStateChange?: (state: "connecting" | "connected" | "disconnected" | "error") => void;
}

interface UseFluxSubscriptionResult {
  /** Current connection state. */
  state: "connecting" | "connected" | "disconnected" | "error";
  /** Number of consecutive reconnect attempts. */
  retryCount: number;
  /** Manually unsubscribe and close the connection. */
  unsubscribe: () => void;
  /** Manually reconnect. */
  reconnect: () => void;
  /** The most recent CDC events received. */
  events: CdcEvent[];
}

const WS_BASE = window.location.protocol === "https:" ? "wss:" : "ws:";
const WS_PATH = "/api/ws/subscribe";

export function useFluxSubscription(
  options: UseFluxSubscriptionOptions,
): UseFluxSubscriptionResult {
  const {
    table,
    consumer_group,
    enabled = true,
    maxRetries = Infinity,
    baseDelayMs = 1000,
    onEvent,
    onStateChange,
  } = options;

  const wsRef = useRef<WebSocket | null>(null);
  const retryCountRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unsubscribedRef = useRef(false);
  const [state, setState] = useState<"connecting" | "connected" | "disconnected" | "error">(
    "disconnected",
  );
  const [events, setEvents] = useState<CdcEvent[]>([]);

  const updateState = useCallback(
    (next: typeof state) => {
      setState(next);
      onStateChange?.(next);
    },
    [onStateChange],
  );

  const connect = useCallback(() => {
    if (unsubscribedRef.current) return;
    if (retryCountRef.current >= maxRetries) {
      updateState("error");
      return;
    }

    updateState("connecting");
    const url = `${WS_BASE}//${window.location.host}${WS_PATH}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      retryCountRef.current = 0;
      updateState("connected");
      // Send subscription request.
      ws.send(
        JSON.stringify({
          table,
          consumer_group: consumer_group ?? null,
        }),
      );
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string);
        if (msg.error) {
          console.error("[Flux subscription]", msg.error);
          updateState("error");
          return;
        }
        if (msg.status === "unsubscribed") return;

        // CDC event from the server.
        if (msg.event_type) {
          const event = msg as CdcEvent;
          setEvents((prev) => [...prev.slice(-199), event]); // keep last 200
          onEvent?.(event);
        }
      } catch {
        // ignore parse errors (acks, etc.)
      }
    };

    ws.onerror = () => {
      updateState("error");
    };

    ws.onclose = () => {
      wsRef.current = null;
      if (unsubscribedRef.current) {
        updateState("disconnected");
        return;
      }
      // Reconnect with exponential backoff.
      retryCountRef.current += 1;
      const delay = Math.min(baseDelayMs * 2 ** (retryCountRef.current - 1), 30_000);
      updateState("disconnected");
      timerRef.current = setTimeout(connect, delay);
    };
  }, [table, consumer_group, maxRetries, baseDelayMs, onEvent, updateState]);

  const unsubscribe = useCallback(() => {
    unsubscribedRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    if (wsRef.current) {
      try {
        wsRef.current.send(JSON.stringify({ action: "unsubscribe" }));
      } catch { /* ignore */ }
      wsRef.current.close();
      wsRef.current = null;
    }
    updateState("disconnected");
  }, [updateState]);

  const reconnect = useCallback(() => {
    unsubscribedRef.current = false;
    retryCountRef.current = 0;
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    connect();
  }, [connect]);

  useEffect(() => {
    if (enabled) {
      unsubscribedRef.current = false;
      retryCountRef.current = 0;
      connect();
    } else {
      unsubscribe();
    }
    return () => {
      unsubscribedRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [enabled, table, consumer_group]);

  return { state, retryCount: retryCountRef.current, unsubscribe, reconnect, events };
}

/**
 * Simple hook that polls a query endpoint on an interval.
 * Used as a fallback when Flux is not available.
 */
export function usePollingQuery(
  query: QueryRequest | null,
  intervalMs: number,
  enabled: boolean,
): { data: Record<string, unknown>[]; loading: boolean; error: string | null } {
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    if (!query) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql: buildSimpleSql(query) }),
      });
      if (!res.ok) throw new Error(`Query failed: ${res.status}`);
      const json = await res.json();
      setData(json.columns ? [] : json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Query failed");
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    if (enabled && query) {
      fetchData();
      timerRef.current = setInterval(fetchData, intervalMs);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [enabled, query, intervalMs, fetchData]);

  return { data, loading, error };
}

function buildSimpleSql(q: QueryRequest): string {
  const parts: string[] = ["SELECT"];
  const cols: string[] = [];
  for (const d of q.dimensions) cols.push(`"${d.column}" AS "${d.name}"`);
  for (const m of q.metrics) cols.push(`(${m.expression}) AS "${m.name}"`);
  if (cols.length === 0) cols.push("*");
  parts.push(cols.join(", "));
  parts.push(`FROM "${q.source}"`);
  if (q.filters.length > 0) {
    parts.push(`WHERE ${q.filters.map((f) => `"${f.column}" ${f.operator} $1`).join(" AND ")}`);
  }
  if (q.dimensions.length > 0) {
    parts.push(`GROUP BY ${q.dimensions.map((d) => `"${d.column}"`).join(", ")}`);
  }
  if (q.order_by.length > 0) {
    parts.push(`ORDER BY ${q.order_by.map((o) => `"${o.column}" ${o.direction}`).join(", ")}`);
  }
  if (q.limit) parts.push(`LIMIT ${q.limit}`);
  return parts.join("\n");
}
