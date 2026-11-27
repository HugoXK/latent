# API and CLI contract

- Status: implemented (`v0.2 alpha`)
- Date: 2026-11-25
- Owner: HugoXK

The HTTP API and the CLI share one contract. The CLI is a thin client; anything the
CLI does, the API can do. The OpenAPI 3.1 document ships in `v0.2`.

## Contract and client

The committed OpenAPI 3.1 document is
[`openapi/latent.openapi.json`](../openapi/latent.openapi.json). It documents every
route, the bearer scheme, the scopes (`x-latent-scope`) and the error responses.
The server test derives the actual Fastify route table from `printRoutes` and fails
when the spec drifts; a route change without a spec update fails CI.

The typed client is [`packages/client`](../packages/client/src/index.ts). Its
operation manifest is checked against the same spec in both directions, so the
client cannot silently miss a route or invent one.

## Conventions

- Base URL: `http://127.0.0.1:4310` for a local install.
- Content type: `application/json; charset=utf-8`.
- IDs: prefixed and URL-safe, for example `frg_01h...`, `idea_01h...`,
  `clm_01h...`, `gate_01h...`, `brf_01h...`.
- Timestamps: RFC 3339, UTC.
- Versioning: the path carries the major version (`/v1`); additive fields do not
  bump it.
- Idempotency: mutating requests accept `Idempotency-Key`; a replay returns the
  first result.
- Pagination: `?limit=50&cursor=...`; the response carries `next_cursor`.
- Errors: a JSON body `{ "error": { "code", "message", "details" } }` with a stable
  `code`.

## Auth

Implemented in `v0.3` (ADR [0011](decisions/0011-local-api-auth.md)):

- **Every `/v1` route requires `Authorization: Bearer <token>`.** `/healthz` and
  `/readyz` are public. Tokens are compared in constant time.
- **Local token resolution**: `LATENT_AUTH_TOKEN` → `LATENT_AUTH_TOKEN_FILE` →
  `data/runtime/auth-token` (created with mode `0600` on first start). The server
  logs the source path, never the token. Do not commit the file.
- **Scopes**: `fragments:read`, `fragments:write`, `ideas:read`, `ideas:write`,
  `gates:run`, `briefs:compile`, `memory:read`, `admin`; `*` grants all.
- **Host/Origin**: the `Host` hostname must be `127.0.0.1`, `localhost` or `::1`
  (DNS rebinding). A request with an `Origin` must be same-origin or in
  `allowedOrigins`, otherwise `403 CSRF_FAILED`. CORS is off.
- **Rate limit**: per token, default 120/minute; `429 RATE_LIMITED` with
  `Retry-After`.
- **Body limit**: default 1 MiB; `413 BODY_TOO_LARGE`.
- **Hosted**: session cookie plus a double-submit CSRF token and TLS are required
  before a browser session is enabled. Cookie auth is not implemented yet.

## Resources

| Resource | Path | Notes |
|---|---|---|
| Fragment | `/v1/fragments` | Capture, list, get, delete |
| Idea | `/v1/ideas` | Develop, get, list, transition |
| Constraint state | `/v1/ideas/{id}/constraints` | Read, answer a question |
| Assumption | `/v1/ideas/{id}/assumptions/{assumptionId}/decide` | Confirm or refute (human) |
| Claim | `/v1/ideas/{id}/claims` | List, verify, contradict |
| Gate | `/v1/ideas/{id}/gates` | Run, decide, waive |
| Brief | `/v1/ideas/{id}/brief` | Compile, get, export |
| Memory | `/v1/memory` | Search, connection explanations, owner-scoped export; fragment delete blocks on references |
| Outcome | `/v1/ideas/{id}/outcome` | Record or list an immutable realised outcome |
| Calibration | `/v1/calibration` | Brier, log loss, reliability bins and missing outcomes |
| Priors | `/v1/priors` | Outcome-backed option priors with sample counts |
| Jobs | `/v1/jobs` | Incubation and research jobs |
| Health | `/healthz`, `/readyz` | Liveness, readiness |

### Capture a fragment

```http
POST /v1/fragments
Idempotency-Key: 8f2c...

{
  "kind": "voice",
  "content": "夜里想到：用土壤菌群做重金属现场检测，但读出还不清楚",
  "language": "zh",
  "privacy": "private",
  "source": "cli"
}
```

```json
{
  "id": "frg_01h...",
  "captured_at": "2026-11-25T02:10:00Z",
  "kind": "voice",
  "content": "夜里想到：用土壤菌群做重金属现场检测，但读出还不清楚",
  "privacy": "private",
  "status": "captured"
}
```

### Develop an idea

```http
POST /v1/ideas
{
  "fragment_id": "frg_01h...",
  "vertical": "igem",
  "variants": 3
}
```

`vertical` is a registered pack id: `igem` (default) or `research`. The core has no
pack branch; the app selects the pack and uses the generic compiler, with the iGEM
extra composer at the app boundary.

```json
{
  "id": "idea_01h...",
  "version": 1,
  "status": "developed",
  "hypotheses": [
    {
      "id": "hyp_01",
      "variant": "conservative",
      "statement": "Use a soil microbial community as a whole-cell biosensor...",
      "confidence": 0.42,
      "confidence_basis": "B"
    }
  ],
  "assumptions": [
    {
      "id": "asm_01",
      "statement": "The readout can be a fluorescence reporter, not an electrochemical one",
      "status": "unconfirmed",
      "risk": "high"
    }
  ],
  "open_questions": [
    {
      "id": "q_01",
      "question": "Does the team have BSL-2 clearance and a plate reader?",
      "expected_information_gain": 0.61
    }
  ]
}
```

### Read the constraints

```http
GET /v1/ideas/{id}/constraints
```

```json
{
  "constraint": { "version": 1, "vertical": "igem", "variables": {}, "unknowns": ["lab.bsl"], "blocking_unknowns": ["lab.bsl"] },
  "blocking": ["lab.bsl", "lab.readers"],
  "next_question": {
    "id": "q.success.metric",
    "variable": "success.metric",
    "prompt": "Which one number should decide whether the project succeeded?",
    "blocking": true,
    "options": [{ "value": "detection_limit", "label": "Limit of detection" }]
  }
}
```

### Answer the next question

```http
POST /v1/ideas/{id}/constraints/answer
{
  "variable": "lab.bsl",
  "value": 1,
  "confidence": 1.0
}
```

The response returns the updated state, the remaining blocking variables and the
next question. A string value that matches an option value or label is normalised
to the option's typed value.

### Undo the last answer

```http
POST /v1/ideas/{id}/constraints/undo
```

The response is the restored constraint state, the recomputed `blocking` set and
the next question. Undo is a new version: the audit log keeps the `answered` event
with its `before`/`after` snapshots and the `undone` event, so neither state is
lost. `GET /v1/ideas/{id}/constraints` returns the current state; the CLI
`constraints diff` shows the last answer's variable-level diff.

### Run gates

```http
POST /v1/ideas/{id}/gates/run
{ "vertical": "igem" }
```

```json
{
  "gates": [
    {
      "id": "gate_01",
      "name": "measurable readout",
      "status": "unknown",
      "falsifier": "No dose response above 2× background across 8 concentrations",
      "fallback": "change_readout",
      "decided_by": "rule"
    }
  ]
}
```

### Decide a gate

```http
POST /v1/ideas/{id}/gates/{gate_id}/decide
{
  "status": "pass",
  "reason": "Pilot showed a 6× dynamic range",
  "evidence": ["clm_01h..."]
}
```

A hard gate cannot be decided by a model. The `decided_by` field is `human` for any
gate that changes scope, spend or safety.

### Compile a brief

```http
POST /v1/ideas/{id}/brief
{
  "components": [
    { "id": "c1", "name": "arsR", "source": "Registry", "grade": "B", "length_bp": 800 }
  ],
  "timeline": {
    "tasks": [{ "id": "t1", "name": "build", "min_weeks": 1, "likely_weeks": 2, "max_weeks": 4 }],
    "calendar": { "summer_full_weeks": 10 },
    "runs": 200,
    "seed": 7
  },
  "material": {
    "target": "product",
    "target_amount": 1,
    "reactions": [{ "id": "r1", "substrates": { "glucose": 2 }, "products": { "product": 1 } }],
    "available": { "glucose": 10 }
  },
  "collisions": []
}
```

`components`, `timeline` and `material` are iGEM inputs; they become sections
(and a risk when the timeline or material balance fails). `collisions` is
vertical-agnostic; omit it to record `collision_check: not_checked`. A blocking
constraint, gate, assumption or validator still refuses the brief.

If a blocking constraint is unanswered, the route returns `409`:

```json
{
  "error": {
    "code": "BLOCKING_CONSTRAINTS",
    "message": "Answer the blocking constraints first.",
    "details": ["lab.bsl", "lab.readers"]
  }
}
```

The compiler refuses to write if any of the four validators fails:

```json
{
  "error": {
    "code": "BRIEF_VALIDATION_FAILED",
    "message": "1 unsupported claim, 1 numeric mismatch",
    "details": { "claims": ["clm_01h..."], "checks": ["citation", "numeric"] }
  }
}
```

### Record an outcome

```http
POST /v1/ideas/{id}/outcome
{
  "decision": "tested",
  "realised_success": true,
  "predicted_confidence": 0.62,
  "notes": "Pilot showed a 6x dynamic range."
}
```

`realised_success` is required and explicit; it is never inferred from `decision`.
The prediction snapshot is stored with the result and cannot be rewritten. The
first outcome for a `briefed` idea moves it to `learned` and writes an
`outcome_of` edge.

### Calibration report

```http
GET /v1/calibration
```

```json
{
  "generated_at": "2026-11-27T00:00:00Z",
  "sample_count": 12,
  "brier": 0.18,
  "log_loss": 0.52,
  "bins": [
    {
      "lower": 0.9,
      "upper": 1.0,
      "count": 2,
      "mean_prediction": 0.93,
      "observed_success_rate": 1.0
    }
  ],
  "missing_outcome_ideas": ["idea_01h..."]
}
```

A missing outcome is visible, not assumed to be a failure. The report sorts by
outcome id and takes an injected clock, so the same rows produce the same report.

### Priors

```http
GET /v1/priors
```

```json
{
  "outcome_sample_count": 12,
  "min_samples": 5,
  "questions": [
    {
      "id": "q.lab.bsl",
      "variable": "lab.bsl",
      "sample_count": 6,
      "source": "empirical",
      "options": [
        { "value": 1, "label": "BSL-1 only", "prior": 0.375, "samples": 2 }
      ]
    }
  ]
}
```

Only ideas with a realised outcome contribute. Below `min_samples` the prior is
uniform; a text question is always uniform. The source and sample count are part of
the response so a prior is never mistaken for a population estimate. Pass
`?vertical=research` to score the research pack's questions (default `igem`).

## CLI

Shipped in `v0.2 alpha`:

```
latent capture <text>
latent develop <fragment-id> [--vertical id]  # igem (default) or research
latent ask <idea-id>                        # highest-information-gain question
latent answer <idea-id> <variable> <value>  # answer a blocking constraint
latent constraints <idea-id>                # state, blocking set, next question
latent constraints undo|diff <idea-id>      # undo the last answer / show its diff
latent confirm <idea-id> <assumption-id> | --all [--refute]
latent decide <idea-id> <gate-id>|--all <pass|fail|unknown|waive> [--reason "..."]
latent brief <idea-id> [--format md|json|html] [--collisions <file>]
        [--components <file>] [--timeline <file>] [--material <file>] [--verify]
latent spec <idea-id> [--format md|json]
latent ledger export <idea-id> [--format jsonl|md]
latent ledger audit <idea-id>               # every claim, source, span and validator
latent novelty <idea-id> --input <json>      # collision report from prior art
latent memory search <query> | connect <from-id> <to-id> | export | delete <fragment-id> [--mark]
latent outcome <idea-id> <decision> --success|--failure [--confidence N]
latent outcomes [idea-id]
latent calibration [--owner <id>]
latent priors [--vertical id] [--min-samples N]
latent ingest <file>                         # local corpus JSON -> snapshots + documents
latent retrieve <query> [--limit N] [--filter k=v]
latent incubate <idea|fragment-id> [--budget N] [--min-score N] [--since ISO]
latent suggestions [--status proposed|accepted|rejected|revoked] [--job <id>]
latent suggestion <id> <accept|reject|revoke>
latent digest [--since ISO]
latent show <id>
```

Every command accepts `--json`. On success it prints
`{ "ok": true, "command": "...", "data": ... }` to stdout. On failure it prints
`{ "ok": false, "command": "...", "error": { "code", "message", "details" } }` to
stderr and exits with the table below. Without `--json`, the command prints the
same `data` as pretty JSON (or Markdown/HTML when `--format` asks for it).

Targeted for `v0.4+`:

```
latent export <idea-id> --out <dir>
latent job list [--status running]
```

Exit codes:

| Code | Meaning |
|---|---|
| `0` | Success |
| `1` | Validation or usage error (schema, units, citations, bad flag) |
| `2` | Not found |
| `3` | Blocked: a hard gate is `fail`/`unknown`, or a brief/spec/constraint check refuses |
| `4` | Auth error |
| `5` | Provider or runtime error |

## Local corpus and retrieval

`latent ingest <file>` (or `POST /v1/corpus`) accepts
`{ "documents": [{ "id", "title", "url", "text", "metadata"? }] }` or a bare
array. Each text becomes a `SourceSnapshot` addressed by its SHA-256; identical
content from two URLs is stored once. `latent retrieve <query>` (or
`POST /v1/retrieval`) builds the BM25 + hashing-embedding + reciprocal-rank-fusion
index from the stored documents on demand. `--filter k=v` / `filters` are exact
metadata matches. Retrieval without a corpus fails closed with `NO_CORPUS`.
Network Registry/wiki/paper adapters remain the `CorpusSource` port; this local
ingest is the first implementation.

## Novelty evidence

`latent novelty <idea-id> --input <json>` accepts a `prior_art[]` list and a
`candidate` (`mechanism`, `interface`, `host`, `readout`, optional `substrate`) and
returns the collision report plus `BriefCollision[]` linked to the idea's claim ids
and the prior-art URLs. Feed that array to `latent brief --collisions <file>`; the
brief records `collision_check.status` and renders it in Markdown and HTML. A
brief without the flag records `not_checked`, which is not a clean result.

## Ledger audit

`latent ledger export <idea-id>` writes every claim as JSONL (default) or a
Markdown table with status, confidence, verifier, text and sources including the
source span. `latent ledger audit <idea-id>` returns the claims plus the latest
brief's validator results, so a reviewer can see why a claim is `verified`,
`unsupported` or `unknown` and which check produced the verdict.

## Web UI

`apps/server/public/` is served by Fastify at `/` and `/ui/*`. The shell is public
(no private data) and uses a strict CSP with external `app.js`/`style.css`; every
`/v1` call sends the bearer token entered in the page (kept in `sessionStorage`).
The flow is capture → interview → assumption ledger → gate board → brief, with a
JSON and a Markdown download. There is no frontend build step.

The smoke test asserts that `/` and `/ui/*` are public, the API still returns 401
without a token, and the CSP header is present. The loop itself is the same API
covered by the server tests.

## Incubation (CLI)

Incubation is shipped first through the CLI. `latent incubate <seed> --budget N`
creates an owner-scoped job, calls `AgentRuntime.schedule`, executes the
deterministic scoring plan, and stores `Suggestion` records. A suggestion is
`proposed`, `accepted`, `rejected` or `revoked` by a human; a job never edits a
fragment or an idea. The budget is in credits (one per suggestion), a job is capped
at 100 credits, and a user has at most four open jobs. `latent digest` is a
read-only weekly view of proposed suggestions.

HTTP job and suggestion routes ship with the runtime work; the `AgentRuntime` port
is the seam for a real scheduler (FlyBot, #55).

## Jobs and callbacks

Incubation and research run as jobs:

```http
POST /v1/jobs
{
  "kind": "incubate",
  "idea_id": "idea_01h...",
  "budget_cny": 1.0
}
```

A runtime adapter may call back:

```http
POST /v1/jobs/{job_id}/callback
X-Latent-Timestamp: 2026-11-27T00:00:00Z
X-Latent-Signature: <hmac>

{ "status": "succeeded", "result": { "connections": [] } }
```

The signature is job-scoped: `HMAC-SHA256(job_secret, job_id + "." + timestamp +
"." + raw_body)` where `job_secret = HMAC-SHA256(root_secret,
"latent-callback:" + job_id)`. A stale timestamp (default 300 s) and a different
job id are rejected. The signing/verification utilities ship now; the HTTP
callback route is a follow-up. The core never writes to a user repository.

## Rate limits and quotas

- Local install: no rate limit; a per-job budget and a global concurrency cap.
- Hosted: per-token rate limit, per-user daily budget, and a hard stop with
  `402 QUOTA_EXHAUSTED`.
- A budget overage requires an explicit human action.

## Compatibility

- Additive fields are non-breaking.
- A removed or renamed field bumps the major version.
- Schema versions are independent of API versions; the `$id` carries the schema
  version.
