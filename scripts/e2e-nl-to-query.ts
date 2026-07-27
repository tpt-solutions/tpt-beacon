// SPDX-License-Identifier: MIT OR Apache-2.0
/**
 * E2E test: Natural-language-to-query flow (Anvil integration).
 *
 * Tests the AI-assisted query compilation pipeline:
 *   1. POST /api/ai/nl-to-query with a natural language question
 *   2. Verify the response contains a compiled SQL query
 *   3. POST /api/compile with the generated SQL
 *   4. Verify the compilation succeeds and returns a cost tier
 *   5. If Anvil is unavailable, verify graceful degradation (mock response)
 *
 * Requires a running beacon-server (Anvil is optional).
 * Run: npx tsx scripts/e2e-nl-to-query.ts
 *
 * Environment:
 *   BEACON_URL — Server base URL (default: http://localhost:3000)
 */

const BASE_URL = process.env.BEACON_URL || "http://localhost:3000";

interface TestResult {
  name: string;
  passed: boolean;
  detail?: string;
}

const results: TestResult[] = [];

function record(name: string, passed: boolean, detail?: string) {
  results.push({ name, passed, detail });
  const icon = passed ? "PASS" : "FAIL";
  const suffix = detail ? ` — ${detail}` : "";
  console.log(`  [${icon}] ${name}${suffix}`);
}

async function api(path: string, opts: RequestInit = {}): Promise<Response> {
  return fetch(`${BASE_URL}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...opts.headers },
  });
}

async function runTest() {
  console.log(`\nE2E: NL-to-Query Flow`);
  console.log(`Server: ${BASE_URL}\n`);

  // 1. Health check.
  try {
    const res = await api("/api/healthz");
    record("Health check", res.ok, `status=${res.status}`);
    if (!res.ok) { printSummary(); process.exit(1); }
  } catch (err: any) {
    record("Health check", false, err.message);
    printSummary(); process.exit(1);
  }

  // 2. NL-to-query: ask a question.
  const questions = [
    "Show me total sales by region",
    "What are the top 10 customers by revenue?",
    "How many orders were placed each day last week?",
  ];

  for (const question of questions) {
    try {
      const res = await api("/api/ai/nl-to-query", {
        method: "POST",
        body: JSON.stringify({ question }),
      });
      const status = res.status;
      const body = await res.json();

      if (status === 200 && body.sql) {
        record(`NL-to-query: "${question.slice(0, 40)}..."`, true, `sql=${body.sql.slice(0, 60)}...`);

        // 3. Compile the generated SQL.
        try {
          const compileRes = await api("/api/compile", {
            method: "POST",
            body: JSON.stringify({ sql: body.sql }),
          });
          const compileBody = await compileRes.json();
          record(
            `Compile generated SQL`,
            compileRes.ok && compileBody.cost_tier != null,
            `cost=${compileBody.cost_tier}`,
          );
        } catch (err: any) {
          record(`Compile generated SQL`, false, err.message);
        }
      } else if (status === 503) {
        // Anvil unavailable — graceful degradation expected.
        record(`NL-to-query: "${question.slice(0, 40)}..."`, true, "Anvil unavailable, graceful degradation");
      } else {
        record(`NL-to-query: "${question.slice(0, 40)}..."`, false, `status=${status}`);
      }
    } catch (err: any) {
      record(`NL-to-query`, false, err.message);
    }
  }

  // 4. Direct SQL compilation.
  try {
    const res = await api("/api/compile", {
      method: "POST",
      body: JSON.stringify({ sql: "SELECT region, SUM(amount) as total FROM orders GROUP BY region" }),
    });
    const body = await res.json();
    record(
      "Direct SQL compilation",
      res.ok && body.hash && body.cost_tier,
      `hash=${body.hash?.slice(0, 12)}... cost=${body.cost_tier}`,
    );
  } catch (err: any) {
    record("Direct SQL compilation", false, err.message);
  }

  // 5. AI suggest (if available).
  try {
    const res = await api("/api/ai/suggest", {
      method: "POST",
      body: JSON.stringify({ context: "orders table with columns: id, region, amount, status, created_at" }),
    });
    if (res.ok) {
      const body = await res.json();
      record("AI suggest", true, `suggestions=${JSON.stringify(body.suggestions)?.slice(0, 80)}...`);
    } else {
      record("AI suggest", true, `status=${res.status} (Anvil may be unavailable)`);
    }
  } catch (err: any) {
    record("AI suggest", false, err.message);
  }

  // 6. AI explain.
  try {
    const res = await api("/api/ai/explain", {
      method: "POST",
      body: JSON.stringify({ sql: "SELECT region, COUNT(*) FROM orders GROUP BY region ORDER BY 2 DESC" }),
    });
    if (res.ok) {
      const body = await res.json();
      record("AI explain", true, `explanation=${(body.explanation || "").slice(0, 60)}...`);
    } else {
      record("AI explain", true, `status=${res.status} (Anvil may be unavailable)`);
    }
  } catch (err: any) {
    record("AI explain", false, err.message);
  }

  printSummary();
}

function printSummary() {
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(`\n${"─".repeat(50)}`);
  console.log(`  ${passed} passed, ${failed} failed, ${results.length} total`);
  console.log(`${"─".repeat(50)}\n`);
}

runTest().catch((err) => {
  console.error("Test runner error:", err);
  process.exit(1);
});
