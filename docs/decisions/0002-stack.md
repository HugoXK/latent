# 0002 — Stack: TypeScript, Node 22.9+, SQLite

- Status: accepted
- Date: 2026-11-25
- Decision owner: HugoXK

## Context

Latent is local-first, single-user by default, and must run on a laptop with the
user's own model keys. It needs a CLI, a web UI, a schema-driven store, and adapters
for runtimes and research tools. It is a sibling of Fledge and ScienceDiscovery,
both TypeScript, and of Janus and AgentDescent, both Python.

The decision is about the **core**, not about every adapter. An adapter may be
written in another language if it speaks the port over HTTP or MCP.

## Candidates

| Stack | Strength | Risk |
|---|---|---|
| **TypeScript + Node 22.9+ + SQLite (`node:sqlite`)** | Same as Fledge; one language for CLI and web; `node:sqlite` removes a native build; easy local install | Weaker scientific/ML libraries than Python |
| Python + FastAPI | Strong science/ML ecosystem (FBA, BioPython, COBRApy) | Two runtimes if the UI is JS; packaging a desktop app is harder |
| Rust + Tauri | Small, fast, secure | Slower iteration; fewer contributors |
| Next.js + Postgres + hosted | Best web DX | Violates local-first as the default; heavier install |

## Decision

- **TypeScript**, ESM, `strict`, **Node 22.9+**.
- **pnpm** workspaces: `apps/` (web, cli) and `packages/` (core, store, adapters,
  verticals).
- **Fastify** for the local HTTP API; server-rendered UI plus a thin client, in the
  same spirit as Fledge. Next.js is not required.
- **SQLite** via `node:sqlite`, single writer. A `Store` port isolates SQL; a move
  to Postgres is a local change.
- **JSON Schema 2020-12** is the contract; TypeScript types are generated.
- Scientific adapters (FBA, sequence tools, literature) may be **Python** behind an
  MCP or HTTP adapter; they are not part of the core.

## Consequences

- One language for the core, the CLI and the web; one install path.
- The science vertical depends on a Python sidecar for COBRApy/Biopython; that is
  an adapter, not a core dependency.
- `node:sqlite` is experimental in some Node versions; pin Node and keep the store
  wrapper to one file.
- A hosted version reuses the same code; Postgres and a worker pool are a port, not
  a rewrite.
- The CI matrix is Node 22 and 24, matching Fledge.
