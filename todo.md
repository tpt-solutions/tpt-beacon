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

- [ ] Add `tpt-sdk` as a path/git dependency in `beacon-keystone-client`
- [ ] Connection management: connect/disconnect, credentials, connection pooling
- [ ] Config schema for one or more Keystone connections (host, port, database, credentials)
- [ ] Schema introspection: tables/columns via `pg_catalog`/`information_schema`
- [ ] Extension-aware introspection: detect `USING SPATIAL`/`USING VECTOR`/`USING GRAPH`/`USING TIME`/`USING JSONPATH` indexes per table (Meridian/Prism/Plexus/Chronos/Canopy)
- [ ] Flux-aware introspection: detect append-only/event-log tables and available consumer groups
- [ ] Health-check endpoint (`beacon-server` → Keystone reachability + version)
- [ ] Query execution wrapper: parameterized query execution, row streaming for large results
- [ ] Integration tests against a local Keystone instance (docker-compose)

---

## Phase 2 — Semantic Layer & Metrics

- [ ] Data model: `Metric`, `Dimension`, `DataSource`, `SavedQuery` entities
- [ ] Storage for semantic layer definitions (in Keystone itself, relational tables)
- [ ] Query-builder-to-SQL compiler: translate a structured query-builder AST into SQL
  - [ ] Relational: filters, joins, group-by, aggregates
  - [ ] Geospatial (Meridian): `ST_*` filter/predicate support
  - [ ] Vector (Prism): `vector_search()`/similarity ordering support
  - [ ] Time-series (Chronos): `time_bucket()`/`moving_average()` support
  - [ ] Graph (Plexus): `MATCH` pattern-query passthrough
  - [ ] Document (Canopy): JSON path operators (`->`/`->>`/`@>`) support
  - [ ] Streaming (Flux): windowed queries over event logs
- [ ] Result caching layer (in-memory + optional persistent cache) keyed by compiled query hash
- [ ] Query cost guard: row-limit / timeout / EXPLAIN-based cost check before execution
- [ ] Saved query CRUD API (`beacon-server`)
- [ ] Unit tests for the query-builder-to-SQL compiler across all 7 data models

---

## Phase 3 — Query Builder UI (React/TS)

- [ ] `apps/web` scaffold: Vite + React + TypeScript, routing, base layout
- [ ] Schema explorer panel (tables/columns/extension indexes from Phase 1 introspection)
- [ ] Drag-and-drop query canvas: fields → filters/group-by/aggregates
- [ ] Per-model builder affordances:
  - [ ] Spatial filter widget (map-based bounding box / radius picker)
  - [ ] Vector similarity widget (reference row / embedding picker + top-K)
  - [ ] Time-bucket widget (interval picker, moving-average toggle)
  - [ ] Graph traversal widget (pattern builder for `MATCH`)
  - [ ] JSON path picker for nested document fields
- [ ] Join builder (visual FK-based join suggestions from introspected schema)
- [ ] Live SQL preview pane (compiled query from Phase 2, read-only)
- [ ] Query result table view (paginated, sortable)
- [ ] Save/load query builder state (wired to Phase 2 Saved Query API)
- [ ] End-to-end test: build a query visually, run it, see results

---

## Phase 4 — Visualization Library

- [ ] Core chart components (D3.js): bar, line, pie/donut, scatter, area, heatmap
- [ ] WebGL-accelerated rendering path for large datasets (point clouds, dense scatter)
- [ ] Meridian map visualization component (points/clusters/heatmap over a base map)
- [ ] Plexus graph visualization component (force-directed layout, node/edge styling)
- [ ] Chronos time-series chart component (downsampling, interpolation, zoom/pan)
- [ ] Prism vector-search result visualization (ranked list + similarity score bars)
- [ ] Shared chart theming/config system (colors, axes, legends, tooltips)
- [ ] Custom visualization plugin API (register a new chart type against a query result shape)
- [ ] Storybook (or equivalent) catalog of all visualization components with sample data
- [ ] Visual regression tests for core chart types

---

## Phase 5 — Dashboards

- [ ] Dashboard data model: layout grid, widgets, widget → saved-query bindings
- [ ] Dashboard canvas UI: drag/resize/reposition widgets on a grid
- [ ] Multi-viz composition: multiple charts + tables on one dashboard
- [ ] Shared filters/parameters: a dashboard-level filter propagates to all bound widgets
- [ ] Dashboard save/load/versioning (revision history)
- [ ] Dashboard duplication/templating
- [ ] Export dashboard to PDF and PNG/image
- [ ] Scheduled dashboard snapshot/export (e.g. nightly PDF email — storage/scheduling only, no email delivery integration required yet)
- [ ] End-to-end test: compose a multi-widget dashboard, apply a shared filter, export to PDF

---

## Phase 6 — Real-Time via Flux

- [ ] WebSocket client (`beacon-server` and/or `apps/web`) to Keystone's Flux WebSocket bridge
- [ ] Subscription management: subscribe/unsubscribe to CDC events per bound query/table
- [ ] Live-updating chart/table widgets: incremental re-render on new Flux events
- [ ] Reconnect/backoff handling for dropped WebSocket connections
- [ ] Dashboard-level toggle for real-time vs. polling refresh
- [ ] Load test: many concurrent dashboard subscribers against one Flux stream
- [ ] End-to-end test: mutate a row in Keystone, confirm dashboard widget updates live

---

## Phase 7 — AI Layer (Anvil Integration)

- [ ] `beacon-anvil-client`: JSON-RPC/IPC client for an already-running `anvil-daemon`
- [ ] Config for locating/connecting to the Anvil daemon (socket/named pipe, or disabled if absent)
- [ ] Natural-language-to-query flow: NL prompt → schema context → compiled query-builder AST
- [ ] AI query suggestions/autocomplete inside the query builder UI
- [ ] NL explanation of query results ("what does this chart show")
- [ ] Graceful degradation: query builder and dashboards fully usable with Anvil unavailable
- [ ] End-to-end test: NL prompt produces a valid, executable query against a sample dataset

---

## Phase 8 — Auth & Sharing (Single-Tenant Instance)

- [ ] User account model: signup/login, password hashing, session/JWT auth
- [ ] Basic roles: admin / editor / viewer (one flat user table, no org/workspace layer)
- [ ] Dashboard and saved-query sharing: share links, per-user/per-role access within the instance
- [ ] API tokens for programmatic access (Phase 1/2 query APIs)
- [ ] Audit log of who viewed/edited/shared what
- [ ] Security review of auth flows (session handling, token scoping, password storage)

---

## Phase 9 — Embedded Analytics

- [ ] Embed SDK: JS snippet + iframe embed for a single dashboard or widget
- [ ] Scoped, short-lived embed tokens (read-only, dashboard-scoped — no workspace/org concept needed)
- [ ] Theming API for host apps (colors, fonts, hide/show chrome)
- [ ] Row-level filtering passed at embed time (e.g. embed scoped to one customer's data via token claims)
- [ ] Example embed integration app (demonstrates a customer-facing white-label dashboard from one self-hosted instance)
- [ ] Security review of embed token scoping and cross-origin behavior

---

## Phase 10 — Performance & Hardening

- [ ] Query result cache tuning (TTL, invalidation on Flux CDC events)
- [ ] Dashboard load benchmarking (many widgets, large result sets)
- [ ] Observability: structured logging, Prometheus metrics, OpenTelemetry tracing for `beacon-server`
- [ ] Security review: full pass on auth, embed tokens, and SQL-injection surface in the query-builder compiler
- [ ] Rate limiting / abuse protection on public APIs and embed endpoints
- [ ] Deployment docs: single-instance Docker Compose quickstart (Beacon + Keystone + optional Anvil), environment variable reference (mirroring Keystone's docs)
- [ ] Single-node resource sizing guide (CPU/RAM/disk recommendations for self-hosting)

---

## Phase 11 — Release Prep

- [ ] Documentation site: getting started, query-builder guide, visualization catalog, embedding guide
- [ ] Example dashboards/datasets showcasing all 7 data models
- [ ] Versioned `CHANGELOG.md`
- [ ] License header audit across all source files
- [ ] v1.0 release checklist and announcement materials
