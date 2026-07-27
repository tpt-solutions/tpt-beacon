// SPDX-License-Identifier: MIT OR Apache-2.0
/**
 * Dashboard load benchmarking script.
 *
 * Measures dashboard render performance with many widgets and large result sets.
 * Run against a local dev server with `npx tsx scripts/benchmark-dashboards.ts`.
 *
 * Environment variables:
 *   BEACON_URL   — Base URL of the server (default: http://localhost:3000)
 *   BEACON_TOKEN — API token for authentication
 *   ITERATIONS   — Number of iterations per scenario (default: 10)
 */

const BASE_URL = process.env.BEACON_URL || "http://localhost:3000";
const TOKEN = process.env.BEACON_TOKEN || "";
const ITERATIONS = parseInt(process.env.ITERATIONS || "10", 10);

interface BenchResult {
  scenario: string;
  iterations: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  minMs: number;
  maxMs: number;
}

function percentile(sorted: number[], p: number): number {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function stats(times: number[]): Omit<BenchResult, "scenario" | "iterations"> {
  const sorted = [...times].sort((a, b) => a - b);
  return {
    avgMs: times.reduce((a, b) => a + b, 0) / times.length,
    p50Ms: percentile(sorted, 50),
    p95Ms: percentile(sorted, 95),
    p99Ms: percentile(sorted, 99),
    minMs: sorted[0],
    maxMs: sorted[sorted.length - 1],
  };
}

async function bench(
  scenario: string,
  fn: () => Promise<void>,
): Promise<BenchResult> {
  const times: number[] = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const start = performance.now();
    await fn();
    times.push(performance.now() - start);
  }
  return { scenario, iterations: ITERATIONS, ...stats(times) };
}

async function api(
  path: string,
  opts: RequestInit = {},
): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    ...((opts.headers as Record<string, string>) || {}),
  };
  return fetch(`${BASE_URL}${path}`, { ...opts, headers });
}

// -- Scenario generators --------------------------------------------------

async function benchSchemaIntrospection(): Promise<void> {
  await api("/api/schema/tables");
}

async function benchSimpleQuery(): Promise<void> {
  await api("/api/query", {
    method: "POST",
    body: JSON.stringify({ sql: "SELECT * FROM orders LIMIT 100" }),
  });
}

async function benchDashboardList(): Promise<void> {
  await api("/api/dashboards");
}

async function benchConcurrentQueries(): Promise<void> {
  const queries = [
    "SELECT region, SUM(amount) as total FROM orders GROUP BY region",
    "SELECT status, COUNT(*) as cnt FROM orders GROUP BY status",
    "SELECT DATE(created_at) as day, COUNT(*) FROM orders GROUP BY day LIMIT 30",
    "SELECT * FROM orders WHERE status = 'active' LIMIT 50",
    "SELECT customer_id, AVG(amount) as avg_order FROM orders GROUP BY customer_id LIMIT 20",
  ];
  await Promise.all(
    queries.map((sql) =>
      api("/api/query", {
        method: "POST",
        body: JSON.stringify({ sql }),
      }),
    ),
  );
}

async function benchCachedRepeatedQuery(): Promise<void> {
  const sql = "SELECT * FROM orders LIMIT 10";
  // First call populates cache, subsequent calls should hit cache.
  await api("/api/query", {
    method: "POST",
    body: JSON.stringify({ sql }),
  });
}

async function benchDashboardCreate(): Promise<void> {
  const name = `bench-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await api("/api/dashboards", {
    method: "POST",
    body: JSON.stringify({
      name,
      config: {
        widgets: Array.from({ length: 5 }, (_, i) => ({
          id: `w${i}`,
          type: "bar",
          query: "SELECT 1 as x, 2 as y",
          x: (i % 3) * 400,
          y: Math.floor(i / 3) * 300,
          width: 380,
          height: 280,
        })),
      },
    }),
  });
}

async function benchCacheStats(): Promise<void> {
  await api("/api/cache/stats");
}

// -- Main ------------------------------------------------------------------

async function main() {
  console.log(`\nTPT Beacon — Dashboard Load Benchmark`);
  console.log(`Server: ${BASE_URL}`);
  console.log(`Iterations per scenario: ${ITERATIONS}\n`);

  const scenarios: [string, () => Promise<void>][] = [
    ["Schema introspection (GET /schema/tables)", benchSchemaIntrospection],
    ["Simple query (POST /query, LIMIT 100)", benchSimpleQuery],
    ["Dashboard list (GET /dashboards)", benchDashboardList],
    ["5 concurrent queries", benchConcurrentQueries],
    ["Repeated query (cache hit)", benchCachedRepeatedQuery],
    ["Dashboard create (5 widgets)", benchDashboardCreate],
    ["Cache stats (GET /cache/stats)", benchCacheStats],
  ];

  const results: BenchResult[] = [];

  for (const [name, fn] of scenarios) {
    process.stdout.write(`  ${name}... `);
    try {
      const result = await bench(name, fn);
      results.push(result);
      console.log(
        `avg=${result.avgMs.toFixed(1)}ms  p50=${result.p50Ms.toFixed(1)}ms  p95=${result.p95Ms.toFixed(1)}ms`,
      );
    } catch (err: any) {
      console.log(`ERROR: ${err.message}`);
      results.push({
        scenario: name,
        iterations: ITERATIONS,
        avgMs: NaN,
        p50Ms: NaN,
        p95Ms: NaN,
        p99Ms: NaN,
        minMs: NaN,
        maxMs: NaN,
      });
    }
  }

  // Summary table.
  console.log(`\n${"─".repeat(90)}`);
  console.log(
    `${"Scenario".padEnd(50)} ${"Avg".padStart(8)} ${"P50".padStart(8)} ${"P95".padStart(8)} ${"Min".padStart(8)} ${"Max".padStart(8)}`,
  );
  console.log(`${"─".repeat(90)}`);
  for (const r of results) {
    const fmt = (v: number) => (isNaN(v) ? "ERR" : `${v.toFixed(1)}ms`);
    console.log(
      `${r.scenario.padEnd(50)} ${fmt(r.avgMs).padStart(8)} ${fmt(r.p50Ms).padStart(8)} ${fmt(r.p95Ms).padStart(8)} ${fmt(r.minMs).padStart(8)} ${fmt(r.maxMs).padStart(8)}`,
    );
  }
  console.log(`${"─".repeat(90)}\n`);
}

main().catch((err) => {
  console.error("Benchmark failed:", err);
  process.exit(1);
});
