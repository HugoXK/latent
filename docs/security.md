# Security and privacy

- Status: accepted
- Date: 2026-11-25
- Owner: HugoXK

Latent handles **thoughts**: unfinished, private, sometimes embarrassing. The
security model starts from that, not from a generic SaaS checklist.

## Reporting

Use GitHub's private vulnerability reporting (**Security → Report a
vulnerability**). Include a description, impact, a minimal reproduction, the
affected version or commit, and whether the issue is already public.

Do not open a public issue for a vulnerability. A first response is expected
within 72 hours.

## Data classification

| Class | Examples | Default handling |
|---|---|---|
| **Sensitive** | Fragments, voice notes, private ideas, assumptions, outcomes | Local by default; encrypted at rest; never sent to a provider without per-provider consent |
| **Confidential** | Claim ledger with private reasoning, gate decisions, calibration history | Encrypted at rest; redacted in logs |
| **Internal** | Audit events, job metadata, timings, counters | Redacted; retained per policy |
| **Public** | Retrieved public sources, compiled briefs the user marks public | Snapshotted with a content hash |
| **Secret** | Model keys, tokens, session secrets | Never in git, never logged, encrypted at rest |

## Threat model

| Threat | Vector | Control |
|---|---|---|
| Data exfiltration to a model provider | A private fragment in a prompt | Local default; per-provider consent; redaction; a visible "what will be sent" preview |
| Prompt injection | A retrieved page says "ignore previous instructions" | Retrieved content is a data-only channel; no tool calls from it; instruction allowlist |
| Fabricated citation | A plausible but unsupported source | Span-level citation verifier; existence check; demote to `unsupported` |
| Numeric deception | A wrong unit or order of magnitude | Unit normalisation and sanity bounds |
| Silent spend | Incubator or research jobs | Per-job budget, quota, hard stop, human approval for overage |
| Gate bypass | A model waives a hard gate | Frozen gate engine; human-only waiver; audit event |
| Cross-tenant leak | Shared hosted store | Row-level isolation; per-tenant keys; no shared caches of private content |
| Secret leak | Logs, errors, telemetry | Redaction; no request bodies; no fragment content in logs by default |
| Supply chain | A malicious dependency or model | Lockfile, dependency audit, pinned actions, SBOM |
| Biosafety / dual use | A dangerous scientific direction | Classifier, refusal, human review, BSL-aware gates |
| Local device compromise | Lost laptop | Encryption at rest; OS keychain for the master key; export/delete |

## Controls

### Local-first

The default deployment is one machine, one SQLite database and a
content-addressed blob directory. A hosted deployment is optional and must not be
required to use the product.

### Local API auth

Implemented in `v0.3` (ADR
[0011](decisions/0011-local-api-auth.md)):

- Every `/v1` route requires a bearer token; `/healthz` and `/readyz` are public.
- The local token comes from `LATENT_AUTH_TOKEN`, `LATENT_AUTH_TOKEN_FILE`, or a
  generated `data/runtime/auth-token` with mode `0600`. The server logs the path,
  never the token.
- Scopes are per route (`fragments:*`, `ideas:*`, `gates:run`,
  `briefs:compile`, `memory:read`, `admin`).
- The `Host` header must be loopback (DNS-rebinding defence). A request with an
  `Origin` must be same-origin or in `allowedOrigins`; otherwise it is refused as
  `CSRF_FAILED`. CORS is off.
- Per-token rate limit (default 120/min) and a 1 MiB body limit.
- Cookie sessions and per-form CSRF tokens are not implemented yet; the web UI
  (#51) must add them before it relies on cookies.

### Encryption at rest

- Sensitive fields and blobs are encrypted with AES-256-GCM.
- The master key lives in the OS keychain where available; otherwise in a file
  with `0600` permissions and an explicit warning.
- Secrets (provider keys, tokens) are encrypted separately from content.

### Redaction

- Logs never contain fragment content, claim text or source bodies by default.
- Errors carry IDs, not payloads.
- Telemetry is opt-in and aggregated.

### Provider consent

- Each model provider is configured explicitly.
- A private fragment is **refused** by the model adapter unless
  `LATENT_MODEL_SEND_PRIVATE=true`; the default is false.
- A team or public fragment may be sent without that switch.
- A pre-send preview in the UI is planned; today the adapter refuses before the
  first send rather than showing a preview.
- The adapter treats the fragment as untrusted data: it is JSON-encoded in the
  prompt and the system prompt tells the model not to follow instructions in it.

### Untrusted retrieval

- Retrieved content is stored as a snapshot and treated as data.
- The orchestrator never executes instructions found in retrieved text.
- Tool calls are allowlisted; a retrieved page cannot add a tool.

### Frozen paths

The ledger, the verifiers, the gate engine and the promotion rule are frozen. An
evolution candidate that changes them is rejected before evaluation. A change
requires an ADR and human approval.

### Sandbox

Code execution, if any, runs through the research adapter's sandbox with explicit
consent. The core never executes user code.

### Biosafety

Science verticals carry a biosafety and dual-use classifier. A direction that
involves a select agent, pathogen enhancement, toxin production or deliberate
harm is refused, not softened. The iGEM vertical additionally enforces BSL-aware
gates: a team without BSL-2 clearance cannot be routed to a BSL-2 host.

### Supply chain

- Locked dependencies; a dependency audit in CI.
- GitHub Actions pinned to a commit SHA where practical.
- A release carries an SBOM.
- No secrets in build logs.

## Data lifecycle

- **Export**: fragments, ideas, claims, gates, briefs and the audit log are
  exportable in an open format (JSON + Markdown).
- **Delete**: deleting a fragment deletes its blobs and derived embeddings;
  derived ideas are marked `orphaned` and require an explicit decision.
- **Retention**: audit events are retained for the configured window; the default
  is 90 days for a local install.
- **Backup**: an online SQLite backup plus the blob directory; a restore drill
  refuses a copy without the application schema.

## Out of scope

- Vulnerabilities in a model provider, a search provider, the runtime (FlyBot), or
  the user's operating system.
- Denial of service from a compromised host account.
- Social engineering.
- Content the user deliberately publishes.

## Safe harbour

Good-faith research that avoids privacy violations, data destruction and service
disruption is welcome. Do not access other users' data, run jobs against
repositories you do not own, or attempt to bypass the gate engine on a live
instance.
