# Contributing to TPT Beacon

Thanks for your interest in contributing to TPT Beacon! This document explains
how to get involved.

## Code of conduct

By participating in this project you agree to abide by our
[Code of Conduct](./CODE_OF_CONDUCT.md).

## Getting started

1. Fork and clone the repository.
2. Install the toolchain:
   - Rust (latest stable) — https://rustup.rs
   - Node.js (LTS) + pnpm or npm
3. Build the workspace:
   - Rust: `cargo build`
   - Frontend: `cd apps/web && npm install && npm run build`
4. Run the test suites before opening a PR (see CI in `.github/workflows`).

## Project structure

Beacon is a Cargo workspace (`crates/*`) plus a Node workspace (`apps/web`).
See [`README.md`](./README.md) for an overview and [`todo.md`](./todo.md) for
the phased roadmap.

## Development conventions

- **Rust:** formatted with `rustfmt` and linted with `clippy`. Run
  `cargo fmt --check` and `cargo clippy --all-targets` before committing.
- **TypeScript / React:** ESLint + Prettier. Run `npm run lint` and
  `npm run typecheck` in `apps/web`.
- **Commits:** use clear, imperative commit messages ("add X", "fix Y").
- **License headers:** source files should carry the MIT OR Apache-2.0
  SPDX identifier where applicable.

## Submitting changes

1. Create a branch off `master`.
2. Make your change with tests where reasonable.
3. Ensure CI passes locally (fmt, clippy, lint, typecheck, tests, build).
4. Open a pull request describing the change and linking any relevant issues.

## Reporting bugs & requesting features

Use the GitHub issue templates (bug report / feature request) under
`.github/ISSUE_TEMPLATE/`. For security issues, please do not open a public
issue — contact the maintainers privately.

## License

By contributing, you agree that your contributions will be licensed under the
project's dual MIT OR Apache-2.0 license.
