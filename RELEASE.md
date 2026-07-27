# TPT Beacon — v1.0 Release Checklist

Pre-release verification checklist. All items must be confirmed before tagging v1.0.0.

---

## Build & Test

- [ ] `cargo check --workspace` passes with zero errors
- [ ] `cargo test --workspace` passes — all 28+ tests green
- [ ] `cargo clippy --workspace` — no warnings (or known acceptable)
- [ ] `npm run build` in `apps/web/` — clean TypeScript + Vite production build
- [ ] `cargo fmt --check` — all Rust code formatted
- [ ] ESLint clean (`npx eslint src/`)

## Runtime Verification

- [ ] `beacon-server` starts, connects to Keystone, seeds admin user
- [ ] Health endpoints (`/api/healthz`, `/api/readyz`) return 200
- [ ] Auth flow: signup, login, JWT validation
- [ ] Schema introspection returns table list
- [ ] Query execution returns results
- [ ] Dashboard CRUD: create, read, update, delete
- [ ] Dashboard versioning: revision history, restore
- [ ] Dashboard export: PNG (html2canvas), PDF (print)
- [ ] Scheduled snapshots: create, list, delete schedule
- [ ] Dependency graph: extracts widget→table relationships
- [ ] Lazy widget loading: widgets render on scroll into view
- [ ] Cache: insert, get (hit/miss), TTL expiry, table invalidation
- [ ] CDC invalidation: WebSocket subscription triggers cache clear
- [ ] Share links: create, validate, list, delete
- [ ] API tokens: create, list, delete
- [ ] Embed tokens: create, validate, embed page renders
- [ ] Embed SDK: iframe mounts, postMessage theme/filter updates
- [ ] Anvil integration: NL-to-query, suggestions, explain (or graceful degradation)
- [ ] Rate limiting: 100 req/min per IP enforced
- [ ] Audit log: entries recorded for mutations, queryable

## Security

- [ ] JWT secret ≥ 32 chars enforced at startup
- [ ] Passwords hashed with Argon2 (not plaintext)
- [ ] SQL injection prevention via `sql_safety` module
- [ ] API token validation against store (not just JWT decode)
- [ ] Embed tokens scoped to dashboard, expirable, row-filter enforced
- [ ] Share links scoped with permissions (view/edit)
- [ ] Admin-only endpoints gated by role check
- [ ] No secrets or keys committed to repository
- [ ] CORS configured appropriately for production
- [ ] CSP headers recommended in deployment docs

## Documentation

- [ ] `CHANGELOG.md` covers all features through v1.0
- [ ] `README.md` with quick-start, architecture overview, link to docs
- [ ] `docs/deployment.md` — Docker Compose, env vars, sizing guide
- [ ] Example embed integration (`examples/embed-integration.html`)
- [ ] E2E test scripts documented in `scripts/`

## Licensing

- [ ] All Rust crate roots have `SPDX-License-Identifier: MIT OR Apache-2.0`
- [ ] All TypeScript source files have `// SPDX-License-Identifier: MIT OR Apache-2.0`
- [ ] `Cargo.toml` workspace-level license field set
- [ ] `package.json` license field set
- [ ] No third-party license conflicts (check `cargo deny` if available)

## Performance

- [ ] Cache TTL and max entries configurable via env vars
- [ ] Benchmark script (`scripts/benchmark-dashboards.ts`) runs clean
- [ ] Lazy widget loading reduces initial dashboard render time
- [ ] Query cache hits measurably faster than cache misses

## Packaging

- [ ] Version bumped to `1.0.0` in `Cargo.toml` workspace
- [ ] Version bumped to `1.0.0` in `apps/web/package.json`
- [ ] Git tag `v1.0.0` created
- [ ] GitHub Release drafted with changelog excerpt
- [ ] Docker image built and tagged (if CI configured)

---

## Post-Release

- [ ] Monitor production logs for errors
- [ ] Collect initial user feedback
- [ ] Plan v1.1 backlog based on usage patterns
