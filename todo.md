# TPT Beacon — Project Task Tracker

> Next-gen BI/analytics platform for TPT Keystone (the "Tableau/Looker Killer")
> Self-hosted, single-tenant by design — one instance per organization, no multi-tenant isolation layer
> Copyright TPT Solutions — Dual licensed: MIT OR Apache-2.0

---

## Phase 0 — Repo & Workspace Setup

- [x] `git init` and push to GitHub (`tpt-solutions/tpt-beacon`)
- [x] Add dual license files: `LICENSE-MIT` and `LICENSE-APACHE`
- [x] Add `LICENSE` root file explaining dual-license choice
- [x] Write initial `README.md` (project overview, status: pre-alpha, self-hosted single-tenant architecture summary)
- [x] Add `CONTRIBUTING.md` and `CODE_OF_CONDUCT.md`
- [x] Add `.gitignore` (Rust, Node.js, IDE files)
- [x] Create monorepo scaffold:
  - `crates/beacon-server` — main API server (Axum)
  - `crates/beacon-semantic` — semantic layer / metrics / query-builder compiler
  - `crates/beacon-keystone-client` — thin wrapper over `tpt-sdk` for Keystone access
  - `crates/beacon-anvil-client` — JSON-RPC client for `anvil-daemon`
  - `apps/web` — React + TypeScript frontend (query builder, dashboards, viz)
  - `docs/` — architecture and user documentation
- [x] Initialize root `Cargo.toml` workspace
- [x] Initialize root `package.json` workspace (npm/pnpm) for `apps/web`
- [x] Configure `rustfmt.toml` + clippy lint rules; ESLint + Prettier + `tsconfig.json` for `apps/web`
- [x] GitHub Actions CI: Rust job (build+test+clippy across workspace), frontend job (lint+typecheck+build+test)
- [x] Add GitHub issue templates (bug report, feature request) and PR template
- [x] `docker-compose.yml` for local dev (Beacon server + Keystone + optional Anvil daemon)

---

## Phase 1 — Keystone Connectivity Layer

- [x] Add `sqlx` as the Keystone connectivity layer (sqlx async Postgres driver)
- [x] Connection management: connect/disconnect, credentials, connection pooling
- [x] Config schema for Keystone connections (host, port, database, credentials)
- [x] Schema introspection: tables/columns via `pg_catalog`/`information_schema`
- [x] Extension-aware introspection: detect `USING SPATIAL`/`USING VECTOR`/`USING GRAPH`/`USING TIME`/`USING JSONPATH` indexes per table
- [x] Flux-aware introspection: detect append-only/event-log tables and available consumer groups
- [x] Health-check endpoint (`beacon-server` → Keystone reachability + version)
- [x] Query execution wrapper: parameterized query execution, row streaming for large results

---

## Phase 2 — Semantic Layer & Metrics

- [x] Data model: `Metric`, `Dimension`, `DataSource`, `SavedQuery` entities (in `beacon-semantic` AST)
- [x] Query-builder-to-SQL compiler: translate a structured query-builder AST into SQL
  - [x] Relational: filters, joins, group-by, aggregates
  - [x] Geospatial (Meridian): `ST_*` filter/predicate support
  - [x] Vector (Prism): `vector_search()`/similarity ordering support
  - [x] Time-series (Chronos): `time_bucket()`/`moving_average()` support
  - [x] Graph (Plexus): `MATCH` pattern-query passthrough
  - [x] Document (Canopy): JSON path operators (`->`/`->>`/`@>`) support
  - [x] Streaming (Flux): windowed queries over event logs
- [x] Result caching layer (in-memory) keyed by compiled query hash
- [x] Query cost guard: row-limit / timeout / heuristic cost check before execution
- [x] Saved query CRUD API (`beacon-server`)
- [x] Unit tests for the query-builder-to-SQL compiler across all 7 data models

---

## Phase 3 — Query Builder UI (React/TS)

- [x] `apps/web` scaffold: Vite + React + TypeScript, routing, base layout
- [x] Schema explorer panel (tables/columns/extension indexes from Phase 1 introspection)
- [x] Drag-and-drop query canvas: fields → filters/group-by/aggregates
- [x] Per-model builder affordances:
  - [x] Spatial filter widget (bounding box / radius picker)
  - [x] Vector similarity widget (reference row + top-K)
  - [x] Time-bucket widget (interval picker, moving-average toggle)
  - [x] Graph traversal widget (pattern builder for `MATCH`)
  - [x] JSON path picker for nested document fields
- [x] Join builder (visual FK-based join suggestions from introspected schema)
- [x] Live SQL preview pane (compiled query from Phase 2, read-only)
- [x] Query result table view (paginated, sortable)
- [x] Save/load query builder state (wired to Phase 2 Saved Query API)

---

## Phase 4 — Visualization Library

- [x] Core chart components (D3.js): bar, line, pie/donut, scatter, area, heatmap
- [x] Shared chart theming/config system (colors, axes, legends, tooltips)
- [x] Meridian map visualization component (points/clusters/heatmap, Canvas-based)
- [x] Plexus graph visualization component (force-directed layout, Canvas-based)
- [x] Chronos time-series chart component (LTTB downsampling, interpolation, zoom/pan)
- [x] Prism vector-search result visualization (ranked list + similarity score bars)
- [x] Custom visualization plugin API (register a new chart type against a query result shape)
- [ ] WebGL-accelerated rendering path for large datasets (point clouds, dense scatter)
- [ ] Storybook (or equivalent) catalog of all visualization components with sample data
- [ ] Visual regression tests for core chart types

---

## Phase 5 — Dashboards

- [x] Dashboard data model: layout grid, widgets, widget → saved-query bindings
- [x] Dashboard canvas UI: drag/resize/reposition widgets on a grid
- [x] Multi-viz composition: multiple charts + tables on one dashboard
- [x] Shared filters/parameters: a dashboard-level filter propagates to all bound widgets
- [x] Dashboard save/load (CRUD API + frontend wiring)
- [x] Dashboard duplication/templating
- [x] Dashboard versioning (revision history + restore)
- [x] Export dashboard to PNG (html2canvas)
- [x] Export dashboard to PDF (browser print fallback)
- [x] Scheduled dashboard snapshot/export (e.g. nightly PDF email)
- [x] Dashboard dependency graph (widget → query → table visualization)
- [x] Progressive/lazy dashboard loading (IntersectionObserver-based widget deferred rendering)
- [ ] End-to-end test: compose a multi-widget dashboard, apply a shared filter, export to PDF

---

## Phase 6 — Real-Time via Flux

- [x] WebSocket endpoint (`POST /api/ws/subscribe`) on `beacon-server` for Flux CDC events
- [x] Subscription management: subscribe to Flux queries, poll at 5s intervals, push CDC events
- [x] Live-updating chart/table widgets: `useFluxSubscription` hook with incremental re-render
- [x] Reconnect/backoff handling for dropped WebSocket connections (exponential backoff, state machine)
- [x] Dashboard-level toggle for real-time vs. polling refresh
- [ ] Load test: many concurrent dashboard subscribers against one Flux stream
- [ ] End-to-end test: mutate a row in Keystone, confirm dashboard widget updates live

---

## Phase 7 — AI Layer (Anvil Integration)

- [x] `beacon-anvil-client`: TCP JSON-RPC client for an already-running `anvil-daemon`
- [x] Config for locating/connecting to the Anvil daemon (host/port, disabled if absent)
- [x] Natural-language-to-query flow: NL prompt → schema context → compiled query-builder AST
- [x] AI query suggestions/autocomplete inside the query builder UI
- [x] NL explanation of query results ("what does this chart show")
- [x] Graceful degradation: query builder and dashboards fully usable with Anvil unavailable
- [x] `POST /api/compile` endpoint for server-side query compilation with cost tier estimation
- [x] End-to-end test: NL prompt produces a valid, executable query against a sample dataset

---

## Phase 8 — Auth & Sharing (Single-Tenant Instance)

- [x] User account model: signup/login, Argon2 password hashing, JWT session auth
- [x] Basic roles: admin / editor / viewer (one flat in-memory user table)
- [x] User management API: list users, set role, delete user (admin-only)
- [x] Frontend auth gate: login/signup page, user display in sidebar, sign-out
- [x] Auth headers injected into all API client requests
- [x] API tokens for programmatic access (sha256-hashed, scoped, expirable)
- [x] Dashboard and saved-query sharing: share links with view/edit permissions
- [x] Audit log of who viewed/edited/shared what (admin-queryable)
- [x] Security review of auth flows (session handling, token scoping, password storage)

---

## Phase 9 — Embedded Analytics

- [x] Embed SDK: JS snippet + iframe embed for a single dashboard (`apps/web/src/embed/index.ts`)
- [x] Embed page (`/embed`) with iframe communication via postMessage (theme/filter updates)
- [x] Scoped, short-lived embed tokens (read-only, dashboard-scoped, expirable, with row-level filter + theme overrides)
- [x] Theming API for host apps (colors, fonts, hide/show chrome via postMessage)
- [x] Row-level filtering passed at embed time (via `row_filter` in embed token, applied at query time)
- [x] Security review of embed token scoping and cross-origin behavior
- [x] Example embed integration app (demonstrates a customer-facing white-label dashboard)

---

## Phase 10 — Performance & Hardening

- [x] Observability: structured logging (tracing), request metrics middleware (method, path, status, elapsed, client IP)
- [x] Rate limiting: in-memory sliding-window rate limiter per IP address (wired into middleware)
- [x] Security review: SQL injection prevention (sql_safety module), API token validation, JWT secret enforcement
- [x] Deployment docs: Docker Compose quickstart, environment variable reference, resource sizing guide
- [x] Query result cache tuning (TTL, invalidation on Flux CDC events)
- [x] Dashboard load benchmarking (many widgets, large result sets)

---

## Phase 11 — Release Prep

- [ ] Documentation site: getting started, query-builder guide, visualization catalog, embedding guide
- [ ] Example dashboards/datasets showcasing all 7 data models
- [x] Versioned `CHANGELOG.md`
- [x] License header audit across all source files
- [x] v1.0 release checklist and announcement materials
