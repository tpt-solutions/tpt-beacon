# Changelog

All notable changes to TPT Beacon will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

#### Phase 0 — Repo & Workspace Setup
- Initial monorepo scaffold with 4 Rust crates and React/TS frontend
- Docker Compose for local development
- GitHub Actions CI/CD

#### Phase 1 — Keystone Connectivity Layer
- `beacon-keystone-client`: async PostgreSQL driver with connection pooling
- Schema introspection (tables, columns, extension indexes)
- Flux-aware introspection (event-log tables, consumer groups)
- Health-check and readiness endpoints

#### Phase 2 — Semantic Layer & Metrics
- Full query AST with support for all 7 Keystone data models
- SQL compiler with filters, joins, group-by, aggregates
- Meridian (geospatial): `ST_*` filter/predicate support
- Prism (vector): `vector_search()`/similarity ordering
- Chronos (time-series): `time_bucket()`/`moving_average()`
- Plexus (graph): `MATCH` pattern-query passthrough
- Canopy (document): JSON path operators
- Flux (streaming): windowed queries over event logs
- In-memory result cache with TTL
- Query cost guard (row-limit, timeout, heuristic cost check)
- Saved query CRUD API

#### Phase 3 — Query Builder UI
- Schema explorer panel with extension detection
- Drag-and-drop query canvas
- Spatial filter, vector similarity, time-bucket, graph traversal, JSON path widgets
- Live SQL preview pane
- Query result table (paginated, sortable)
- Save/load query builder state

#### Phase 4 — Visualization Library
- D3.js chart components: bar, line, pie/donut, scatter, area, heatmap
- Meridian map visualization (points/clusters/heatmap, Canvas-based)
- Plexus graph visualization (force-directed layout, Canvas-based)
- Prism vector search results (ranked list with score bars)
- Chronos time-series (LTTB downsampling, interpolation, zoom/pan)
- Custom visualization plugin API

#### Phase 5 — Dashboards
- Dashboard CRUD (create, read, update, delete)
- Dashboard canvas with drag/resize/reposition widgets
- Multi-viz composition on a single dashboard
- Dashboard-level shared filters
- Dashboard versioning (revision history, restore)
- Export dashboard to PNG (html2canvas)
- Export dashboard to PDF (browser print fallback)
- Dashboard duplication
- Scheduled snapshot management (create, list, delete schedules)
- Dashboard dependency graph (widget → query → table visualization)
- Progressive/lazy dashboard loading (IntersectionObserver-based deferred rendering)

#### Phase 6 — Real-Time via Flux
- WebSocket endpoint for Flux CDC events
- `useFluxSubscription` hook with exponential backoff reconnect
- Live-updating chart/table widgets with LIVE badge
- Dashboard-level realtime toggle

#### Phase 7 — AI Layer (Anvil Integration)
- `beacon-anvil-client`: TCP JSON-RPC client
- Natural-language-to-query flow
- AI query suggestions/autocomplete
- NL explanation of query results
- Server-side query compilation with cost tier estimation
- Graceful degradation when Anvil is unavailable

#### Phase 8 — Auth & Sharing
- User accounts: signup/login, Argon2 password hashing, JWT sessions
- Roles: admin / editor / viewer
- User management API (list, set role, delete — admin-only)
- Frontend auth gate with login/signup page
- API tokens for programmatic access (SHA-256 hashed, scoped, expirable)
- Share links for dashboards and saved queries (view/edit permissions)
- Audit log (admin-queryable)
- Admin page UI for tokens, shares, audit log

#### Phase 9 — Embedded Analytics
- Embed SDK: JS snippet + iframe embed for dashboards
- Embed page (`/embed`) with postMessage communication
- Scoped, short-lived embed tokens (dashboard-scoped, expirable)
- Theming API via postMessage (colors, fonts, hide/show chrome)
- Row-level filtering at embed time
- Token validation endpoint
- Example embed integration app (`examples/embed-integration.html`)

#### Phase 10 — Performance & Hardening
- Structured request logging (tracing)
- In-memory sliding-window rate limiter per IP
- SQL injection prevention (`sql_safety` module)
  - Identifier validation (table/column names)
  - Expression validation (metric expressions, allowlist)
  - Graph pattern validation
  - Time interval validation
- API token validation against store (fixed bypass vulnerability)
- JWT secret enforcement (min 32 chars, startup warning)
- Deployment docs (Docker Compose, env vars, sizing guide)
- Query result cache with configurable TTL (`CACHE_MAX_ENTRIES`, `CACHE_TTL_SECS` env vars)
- Table-based cache invalidation (entries tagged with table names)
- CDC-driven cache invalidation (WebSocket subscription triggers cache clear for affected table)
- Cache management API (`GET /api/cache/stats`, `POST /api/cache/invalidate`, `POST /api/cache/invalidate/table`)
- Dashboard load benchmarking script (`scripts/benchmark-dashboards.ts`)

#### Phase 11 — Release Prep
- Versioned CHANGELOG.md
- License header audit (SPDX `MIT OR Apache-2.0` on all 64 source files)
- v1.0 release checklist (`RELEASE.md`)
- E2E test scripts: live subscription, NL-to-query, auth/share flow
- Configurable cache via environment variables (`CACHE_MAX_ENTRIES`, `CACHE_TTL_SECS`)
- Server configuration centralized in `ServerConfig` struct
