// SPDX-License-Identifier: MIT OR Apache-2.0
/**
 * E2E test: Flux real-time subscription flow.
 *
 * Tests the WebSocket subscription lifecycle:
 *   1. Connect to /api/ws/subscribe
 *   2. Send a subscription request for a table
 *   3. Receive the initial acknowledgment
 *   4. Wait for at least one CDC event (or timeout)
 *   5. Unsubscribe and disconnect
 *
 * Requires a running beacon-server and a Flux-enabled table.
 * Run: npx tsx scripts/e2e-live-subscription.ts
 *
 * Environment:
 *   BEACON_URL — Server base URL (default: http://localhost:3000)
 *   TEST_TABLE — Flux table to subscribe to (default: "events")
 *   TIMEOUT_MS — Max wait for a CDC event (default: 15000)
 */

const BASE_URL = process.env.BEACON_URL || "http://localhost:3000";
const TEST_TABLE = process.env.TEST_TABLE || "events";
const TIMEOUT_MS = parseInt(process.env.TIMEOUT_MS || "15000", 10);

function wsUrl(): string {
  return BASE_URL.replace(/^http/, "ws") + "/api/ws/subscribe";
}

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

async function runTest() {
  console.log(`\nE2E: Live Subscription Flow`);
  console.log(`Server: ${BASE_URL}  Table: ${TEST_TABLE}\n`);

  // 1. Health check.
  try {
    const res = await fetch(`${BASE_URL}/api/healthz`);
    record("Health check", res.ok, `status=${res.status}`);
    if (!res.ok) {
      printSummary();
      process.exit(1);
    }
  } catch (err: any) {
    record("Health check", false, err.message);
    printSummary();
    process.exit(1);
  }

  // 2. WebSocket connection.
  let socket: WebSocket;
  try {
    socket = new WebSocket(wsUrl());
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("ws connect timeout")), 5000);
      socket.onopen = () => { clearTimeout(timer); resolve(); };
      socket.onerror = (ev) => { clearTimeout(timer); reject(new Error("ws error")); };
    });
    record("WebSocket connect", true);
  } catch (err: any) {
    record("WebSocket connect", false, err.message);
    printSummary();
    process.exit(1);
  }

  // 3. Send subscription request.
  let ackReceived = false;
  let cdcEventReceived = false;
  const messages: string[] = [];

  socket.onmessage = (ev) => {
    const data = typeof ev.data === "string" ? ev.data : "";
    messages.push(data);
    try {
      const parsed = JSON.parse(data);
      if (parsed.status === "subscribed") ackReceived = true;
      if (parsed.event_type) cdcEventReceived = true;
    } catch { /* non-JSON */ }
  };

  try {
    socket.send(JSON.stringify({ table: TEST_TABLE }));
    record("Subscription request sent", true);
  } catch (err: any) {
    record("Subscription request sent", false, err.message);
    socket.close();
    printSummary();
    process.exit(1);
  }

  // 4. Wait for acknowledgment.
  const ackStart = Date.now();
  while (!ackReceived && Date.now() - ackStart < 5000) {
    await new Promise((r) => setTimeout(r, 100));
  }
  record("Subscription acknowledgment", ackReceived, `messages=${messages.length}`);

  // 5. Wait for a CDC event (or timeout — server may not have data).
  if (ackReceived) {
    const cdcStart = Date.now();
    while (!cdcEventReceived && Date.now() - cdcStart < TIMEOUT_MS) {
      await new Promise((r) => setTimeout(r, 200));
    }
    if (cdcEventReceived) {
      record("CDC event received", true, `after ${Date.now() - cdcStart}ms`);
    } else {
      record("CDC event received", false, `timeout after ${TIMEOUT_MS}ms (table may have no data)`);
    }
  }

  // 6. Unsubscribe.
  try {
    socket.send(JSON.stringify({ action: "unsubscribe" }));
    await new Promise((r) => setTimeout(r, 500));
    const unsubMsg = messages[messages.length - 1];
    const parsed = JSON.parse(unsubMsg || "{}");
    record("Unsubscribe", parsed.status === "unsubscribed", unsubMsg);
  } catch (err: any) {
    record("Unsubscribe", false, err.message);
  }

  // 7. Cleanup.
  try { socket.close(); } catch { /* already closed */ }
  record("WebSocket close", true);

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
