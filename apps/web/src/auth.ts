// SPDX-License-Identifier: MIT OR Apache-2.0
/**
 * Auth API client — signup, login, token management.
 */

export interface User {
  id: string;
  email: string;
  display_name: string;
  role: "admin" | "editor" | "viewer";
  created_at: string;
  last_login: string | null;
}

interface AuthResponse {
  user: User;
  token: string;
}

const BASE = "/api/auth";
const TOKEN_KEY = "beacon_token";
const USER_KEY = "beacon_user";

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getCurrentUser(): User | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function storeUser(user: User) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export async function signup(
  email: string,
  password: string,
  displayName: string,
): Promise<AuthResponse> {
  const res = await fetch(`${BASE}/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, display_name: displayName }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Signup failed: ${res.status}`);
  }
  const data: AuthResponse = await res.json();
  setToken(data.token);
  storeUser(data.user);
  return data;
}

export async function login(
  email: string,
  password: string,
): Promise<AuthResponse> {
  const res = await fetch(`${BASE}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Login failed: ${res.status}`);
  }
  const data: AuthResponse = await res.json();
  setToken(data.token);
  storeUser(data.user);
  return data;
}

export async function fetchMe(): Promise<User | null> {
  const res = await fetch(`${BASE}/me`, { headers: authHeaders() });
  if (!res.ok) return null;
  const user: User = await res.json();
  storeUser(user);
  return user;
}

export async function listUsers(): Promise<User[]> {
  const res = await fetch(`${BASE}/users`, { headers: authHeaders() });
  if (!res.ok) return [];
  const data = await res.json();
  return data.users ?? [];
}

export async function setUserRole(
  userId: string,
  role: string,
): Promise<User | null> {
  const res = await fetch(`${BASE}/users/${userId}/role`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ role }),
  });
  if (!res.ok) return null;
  return res.json() as Promise<User>;
}

export async function deleteUser(userId: string): Promise<boolean> {
  const res = await fetch(`${BASE}/users/${userId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  return res.ok;
}

// ── API Tokens ───────────────────────────────────────────────

export interface ApiToken {
  id: string;
  user_id: string;
  name: string;
  scopes: string[];
  expires_at: string | null;
  created_at: string;
  last_used: string | null;
}

export interface CreateTokenResult {
  token: ApiToken;
  raw_token: string;
}

export async function listApiTokens(): Promise<ApiToken[]> {
  const res = await fetch("/api/tokens", { headers: authHeaders() });
  if (!res.ok) return [];
  const data = await res.json();
  return data.tokens ?? [];
}

export async function createApiToken(
  name: string,
  scopes: string[],
  expiresInHours?: number,
): Promise<CreateTokenResult | null> {
  const res = await fetch("/api/tokens", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ name, scopes, expires_in_hours: expiresInHours }),
  });
  if (!res.ok) return null;
  return res.json();
}

export async function deleteApiToken(tokenId: string): Promise<boolean> {
  const res = await fetch(`/api/tokens/${tokenId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  return res.ok;
}

// ── Share Links ──────────────────────────────────────────────

export interface ShareLink {
  id: string;
  resource_type: string;
  resource_id: string;
  created_by: string;
  permission: "view" | "edit";
  expires_at: string | null;
  created_at: string;
}

export async function listShareLinks(
  resourceType: string,
  resourceId: string,
): Promise<ShareLink[]> {
  const res = await fetch(
    `/api/shares?resource_type=${resourceType}&resource_id=${resourceId}`,
    { headers: authHeaders() },
  );
  if (!res.ok) return [];
  const data = await res.json();
  return data.shares ?? [];
}

export async function createShareLink(
  resourceType: string,
  resourceId: string,
  permission: "view" | "edit",
  expiresInHours?: number,
): Promise<ShareLink | null> {
  const res = await fetch("/api/shares", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({
      resource_type: resourceType,
      resource_id: resourceId,
      permission,
      expires_in_hours: expiresInHours,
    }),
  });
  if (!res.ok) return null;
  return res.json();
}

export async function deleteShareLink(linkId: string): Promise<boolean> {
  const res = await fetch(`/api/shares/${linkId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  return res.ok;
}

// ── Audit Log ────────────────────────────────────────────────

export interface AuditEntry {
  id: string;
  user_id: string;
  action: string;
  resource_type: string;
  resource_id: string;
  timestamp: string;
  details: string | null;
}

export async function getAuditLog(limit = 100): Promise<AuditEntry[]> {
  const res = await fetch(`/api/audit?limit=${limit}`, {
    headers: authHeaders(),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.entries ?? [];
}
