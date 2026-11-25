# 0005 — Ecosystem: ports and adapters, not hard dependencies

- Status: accepted
- Date: 2026-11-25
- Decision owner: HugoXK

## Context

Latent is one of several sibling projects:

- **FlyBot** — a long-lived agent runtime with team memory and schedules.
- **AgentDescent** — offline evolution of prompts, skills and harnesses, with a
  held-out gate and a promotion ledger.
- **Janus** — point-in-time memory and calibrated forecasts.
- **ScienceDiscovery** — a local research workspace with provenance and a sandbox.
- **Bot Social / Bothouse** — sharing and team collaboration.
- **OpenTeamily / LaunchPad** — runtime containers and agent CI.

The obvious move is to wire them together directly. That would make each project a
dependency of the others: a version skew in one breaks the product, a permission in
one leaks into another, and the core cannot run alone.

Fledge's hard rule is instructive: *a Fledge approval grants Fledge only; do not
wire it to FlyBot, Bot Social or ScienceDiscovery.* We adopt the same principle.

## Decision

### The core depends on ports

```ts
interface AgentRuntime { schedule(job): Promise<JobRef>; cancel(ref): Promise<void>; }
interface Evolver      { propose(artifact, dataset): Promise<Candidate[]>; evaluate(c, holdout): Promise<Evaluation>; }
interface Calibrator   { record(prediction, outcome): Promise<void>; curve(scope): Promise<CalibrationCurve>; }
interface ResearchTools{ literature(query): Promise<Paper[]>; run(code, input): Promise<RunResult>; }
```

Each has at least one fake for tests and at least one real adapter. The core must
run end to end with the fakes and no network.

### Mapping

| Port | Default | Optional adapters |
|---|---|---|
| `AgentRuntime` | Local scheduler | FlyBot, OpenTeamily |
| `Evolver` | No-op | AgentDescent (offline only) |
| `Calibrator` | Local ledger | Janus-style service |
| `ResearchTools` | Local fixtures | ScienceDiscovery, PubMed/Europe PMC |
| Sharing | Off | Bot Social, Bothouse |

### Scope and permissions

- An approval for Latent grants Latent only.
- An adapter receives the minimum scope it needs; the core never hands a runtime a
  user token it does not need.
- AgentDescent never sits on the request path, never receives a private fragment,
  and cannot modify a frozen path (ledger, verifier, gate engine, promotion rule).
- FlyBot jobs are signed, job-scoped and revoked when the job ends.

### Version skew

- Ports are versioned; an adapter declares the port version it implements.
- A contract test suite is the compatibility gate.
- The core pins a port major, not an adapter version.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| A monorepo with shared internals | Couples release cycles; one break stops everything |
| Direct imports of sibling packages | A permission and a version leak; the core cannot run alone |
| Rebuild runtime/research/social inside Latent | Duplicates the ecosystem and slows the core |
| A single "platform" service that owns everything | The exact coupling Fledge warns against |

## Consequences

- Integration is more work up front (ports, fakes, contract tests).
- The core is usable alone, on a laptop, with no sibling project installed.
- A sibling can evolve without a Latent release, as long as the port contract holds.
- The product can be embedded in a team's existing FlyBot/ScienceDiscovery setup
  without adopting the whole ecosystem.
