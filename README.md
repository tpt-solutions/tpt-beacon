# TPT Beacon

> Next-gen BI / analytics platform for **TPT Keystone** — the "Tableau/Looker Killer".

TPT Beacon is a free, self-hosted business intelligence and analytics platform
built specifically to leverage [TPT Keystone](https://tpt.dev)'s multi-model
capabilities. It provides a beautiful, intuitive drag-and-drop query builder,
native support for all 7 Keystone data models, real-time dashboards powered by
TPT Flux event streaming, an advanced visualization library (maps, charts,
graphs, custom D3-style visualizations), embedded analytics, and AI-powered
natural-language querying via TPT Anvil.

## Status

**Pre-alpha.** The repository is currently scaffolding. Nothing here is yet
production-ready. APIs, schemas, and the UI will change frequently. See
[`todo.md`](./todo.md) for the phased roadmap.

## Why Beacon?

Commercial BI tools are essential but expensive (Tableau ~$70/user/month, Looker
custom pricing, Power BI per-user licensing). Open-source alternatives (Metabase,
Superset) exist but lag on polish, performance, and advanced features. Beacon
democratizes BI: data-driven decision making should not require per-seat
licensing.

## Architecture

Beacon is **self-hosted and single-tenant by design**: one instance serves one
organization. There is intentionally **no multi-tenant isolation layer** — this
keeps the deployment and security model simple for self-hosting.

```
                       ┌─────────────────────────────┐
    Browser ◄─────────►│  apps/web (React + TS)      │
                       └───────────────┬─────────────┘
                                       │ HTTP / WebSocket
                                       ▼
                       ┌─────────────────────────────┐
                       │  beacon-server (Axum, Rust) │
                       ├─────────────────────────────┤
                       │  beacon-semantic            │  semantic layer +
                       │  beacon-keystone-client     │  query-builder SQL
                       │  beacon-anvil-client        │  compiler
                       └───────┬───────────────┬─────┘
                               │               │
                  Flux WS      │               │ JSON-RPC/IPC
                               ▼               ▼
                    ┌──────────────┐   ┌──────────────┐
                    │ TPT Keystone │   │ anvil-daemon │
                    │ (multi-model)│   │ (AI / LLM)   │
                    └──────────────┘   └──────────────┘
```

### The 7 Keystone data models

| Model        | Keystone extension | Beacon support |
|--------------|--------------------|----------------|
| Relational   | —                  | filters, joins, group-by, aggregates |
| Geospatial   | Meridian           | `ST_*` filters (bounding box / radius) |
| Vector       | Prism              | `vector_search()` / similarity ordering |
| Time-series  | Chronos            | `time_bucket()` / `moving_average()` |
| Graph        | Plexus             | `MATCH` pattern-query passthrough |
| Document     | Canopy             | JSON path operators (`->`, `->>`, `@>`) |
| Streaming    | Flux               | windowed queries over event logs |

## Repository layout

```
tpt-beacon/
├── crates/
│   ├── beacon-server/          # main API server (Axum)
│   ├── beacon-semantic/        # semantic layer + query-builder SQL compiler
│   ├── beacon-keystone-client/ # thin wrapper over tpt-sdk
│   └── beacon-anvil-client/    # JSON-RPC client for anvil-daemon
├── apps/
│   └── web/                    # React + TypeScript frontend
├── docs/                       # architecture & user documentation
├── todo.md                     # phased roadmap
└── spec.txt                    # product spec
```

## Tech stack

- **Core engine:** Rust (high-performance query execution)
- **Query builder / UI:** React + TypeScript
- **Visualization:** D3.js and WebGL
- **Real-time:** TPT Flux event streaming
- **AI layer:** Local LLM integration via TPT Anvil

## Getting started

> Local dev tooling is being assembled. See [`docker-compose.yml`](./docker-compose.yml)
> once available, and [`docs/`](./docs) for setup details.

## License

TPT Beacon is dual licensed under **MIT OR Apache-2.0** at your option.

- [`LICENSE-MIT`](./LICENSE-MIT)
- [`LICENSE-APACHE`](./LICENSE-APACHE)
- [`LICENSE`](./LICENSE) — explanation of the dual-license choice

Copyright TPT Solutions.
