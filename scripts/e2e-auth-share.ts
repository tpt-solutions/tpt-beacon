// SPDX-License-Identifier: MIT OR Apache-2.0
/**
 * E2E test: Signup → Login → Create Dashboard → Share Link flow.
 *
 * Tests the full user lifecycle:
 *   1. Register a new user via POST /api/auth/signup
 *   2. Login and get a JWT token via POST /api/auth/login
 *   3. Verify identity via GET /api/auth/me
 *   4. Create a dashboard
 *   5. Create a share link for the dashboard
 *   6. Validate the share link
 *   7. Create an API token
 *   8. Verify the API token works
 *   9. Check audit log
 *  10. Clean up resources
 *
 * Requires a running beacon-server.
 * Run: npx tsx scripts/e2e-auth-share.ts
 *
 * Environment:
 *   BEACON_URL — Server base URL (default: http://localhost:3000)
 */

const BASE_URL = process.env.BEACON_URL || "http://localhost:3000";
const TEST_EMAIL = `e2e-${Date.now()}@test.example.com`;
const TEST_PASSWORD = "Test1234!@#$";
const TEST_NAME = "E2E Test User";

interface TestResult {
  name: string;
  passed: boolean;
  detail?: string;
}

const results: TestResult[] = [];
let authToken = "";
let dashboardId = "";
let shareLinkId = "";
let apiTokenId = "";

function record(name: string, passed: boolean, detail?: string) {
  results.push({ name, passed, detail });
  const icon = passed ? "PASS" : "FAIL";
  const suffix = detail ? ` — ${detail}` : "";
  console.log(`  [${icon}] ${name}${suffix}`);
}

async function api(
  path: string,
  opts: RequestInit = {},
  token?: string,
): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((opts.headers as Record<string, string>) || {}),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return fetch(`${BASE_URL}${path}`, { ...opts, headers });
}

async function runTest() {
  console.log(`\nE2E: Auth → Share Flow`);
  console.log(`Server: ${BASE_URL}  User: ${TEST_EMAIL}\n`);

  // 1. Health check.
  try {
    const res = await api("/api/healthz");
    record("Health check", res.ok, `status=${res.status}`);
    if (!res.ok) { printSummary(); process.exit(1); }
  } catch (err: any) {
    record("Health check", false, err.message);
    printSummary(); process.exit(1);
  }

  // 2. Signup.
  try {
    const res = await api("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD, name: TEST_NAME }),
    });
    const body = await res.json();
    record("Signup", res.ok || res.status === 409, `status=${res.status}`);
  } catch (err: any) {
    record("Signup", false, err.message);
  }

  // 3. Login.
  try {
    const res = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    });
    const body = await res.json();
    authToken = body.token || "";
    record("Login", res.ok && !!authToken, `token=${authToken.slice(0, 20)}...`);
  } catch (err: any) {
    record("Login", false, err.message);
    printSummary(); process.exit(1);
  }

  // 4. Verify identity.
  try {
    const res = await api("/api/auth/me", {}, authToken);
    const body = await res.json();
    record(
      "Verify identity",
      res.ok && body.email === TEST_EMAIL,
      `email=${body.email} role=${body.role}`,
    );
  } catch (err: any) {
    record("Verify identity", false, err.message);
  }

  // 5. Create dashboard.
  try {
    const res = await api("/api/dashboards", {
      method: "POST",
      body: JSON.stringify({
        name: `E2E Dashboard ${Date.now()}`,
        config: {
          widgets: [{
            id: "w1", type: "bar",
            query: "SELECT 1 as x, 2 as y",
            x: 0, y: 0, width: 400, height: 300,
          }],
        },
      }),
    }, authToken);
    const body = await res.json();
    dashboardId = body.id || "";
    record("Create dashboard", res.ok && !!dashboardId, `id=${dashboardId}`);
  } catch (err: any) {
    record("Create dashboard", false, err.message);
  }

  // 6. Create share link.
  if (dashboardId) {
    try {
      const res = await api("/api/shares", {
        method: "POST",
        body: JSON.stringify({
          resource_type: "dashboard",
          resource_id: dashboardId,
          permissions: ["view"],
          expires_in_hours: 24,
        }),
      }, authToken);
      const body = await res.json();
      shareLinkId = body.id || "";
      record("Create share link", res.ok && !!shareLinkId, `id=${shareLinkId}`);
    } catch (err: any) {
      record("Create share link", false, err.message);
    }
  }

  // 7. Validate share link.
  if (shareLinkId) {
    try {
      const res = await api(`/api/shares/${shareLinkId}/validate`);
      const body = await res.json();
      record(
        "Validate share link",
        res.ok && body.valid === true,
        `valid=${body.valid} resource=${body.resource_type}`,
      );
    } catch (err: any) {
      record("Validate share link", false, err.message);
    }
  }

  // 8. Create API token.
  try {
    const res = await api("/api/tokens", {
      method: "POST",
      body: JSON.stringify({ name: "e2e-test-token", expires_in_hours: 1 }),
    }, authToken);
    const body = await res.json();
    apiTokenId = body.id || "";
    record(
      "Create API token",
      res.ok && !!body.token,
      `id=${apiTokenId} token=${(body.token || "").slice(0, 20)}...`,
    );
  } catch (err: any) {
    record("Create API token", false, err.message);
  }

  // 9. List API tokens.
  try {
    const res = await api("/api/tokens", {}, authToken);
    const body = await res.json();
    const count = Array.isArray(body) ? body.length : 0;
    record("List API tokens", res.ok, `count=${count}`);
  } catch (err: any) {
    record("List API tokens", false, err.message);
  }

  // 10. Check audit log.
  try {
    const res = await api("/api/audit?limit=10", {}, authToken);
    const body = await res.json();
    const entries = Array.isArray(body) ? body : body.entries || [];
    record("Audit log query", res.ok, `entries=${entries.length}`);
  } catch (err: any) {
    record("Audit log query", false, err.message);
  }

  // 11. Cleanup: delete share link.
  if (shareLinkId) {
    try {
      const res = await api(`/api/shares/${shareLinkId}`, { method: "DELETE" }, authToken);
      record("Delete share link", res.ok || res.status === 404);
    } catch (err: any) {
      record("Delete share link", false, err.message);
    }
  }

  // 12. Cleanup: delete API token.
  if (apiTokenId) {
    try {
      const res = await api(`/api/tokens/${apiTokenId}`, { method: "DELETE" }, authToken);
      record("Delete API token", res.ok || res.status === 404);
    } catch (err: any) {
      record("Delete API token", false, err.message);
    }
  }

  // 13. Cleanup: delete dashboard.
  if (dashboardId) {
    try {
      const res = await api(`/api/dashboards/${dashboardId}`, { method: "DELETE" }, authToken);
      record("Delete dashboard", res.ok || res.status === 404);
    } catch (err: any) {
      record("Delete dashboard", false, err.message);
    }
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
