# API and CLI contract

- Status: implemented (`v0.2 alpha`)
- Date: 2026-11-25
- Owner: HugoXK

The HTTP API and the CLI share one contract. The CLI is a thin client; anything the
CLI does, the API can do. The OpenAPI 3.1 document ships in `v0.2`.

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

- **Local**: a bearer token stored in the OS keychain, or a loopback-only session
  cookie for the web UI.
- **Hosted**: session cookie plus CSRF for browser forms; bearer token for the CLI
  and integrations.
- Scopes: `fragments:read`, `fragments:write`, `ideas:read`, `ideas:write`,
  `gates:run`, `briefs:compile`, `memory:read`, `admin`.

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

A direction that matches the biosafety screen is refused before reconstruction:

```http
POST /v1/ideas
{ "fragment_id": "frg_01h...", "vertical": "igem" }
```

```json
{
  "error": {
    "code": "BIOSAFETY_BLOCKED",
    "message": "select agent or BSL-3/4 pathogen; a biosafety review is required",
    "details": { "category": "select_agent", "bsl": 3 }
  }
}
```

HTTP status `422`. `category` is the matched class (`select_agent`, `toxin`,
`enhancement` or `pathogen`) and `bsl` is the BSL level the direction requires.
The matching text is not echoed.

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
{ "format": "markdown" }
```

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

## CLI

Shipped in `v0.2 alpha`:

```
latent capture <text>
latent develop <fragment-id>
latent ask <idea-id>                        # highest-information-gain question
latent answer <idea-id> <variable> <value>  # answer a blocking constraint
latent constraints <idea-id>                # state, blocking set, next question
latent confirm <idea-id> <assumption-id> | --all [--refute]
latent decide <idea-id> <gate-id>|--all <pass|fail|unknown|waive> [--reason "..."]
latent brief <idea-id> [--format md|json|html] [--verify]
latent spec <idea-id> [--format md|json]
latent ledger export <idea-id> [--format jsonl|md]
latent show <id>
```

Targeted for `v0.3+`:

```
latent export <idea-id> --out <dir>
latent memory search <query>
latent job list [--status running]
```

Exit codes:

| Code | Meaning |
|---|---|
| `0` | Success |
| `1` | Validation error (schema, units, citations) |
| `2` | Not found |
| `3` | Gate blocked (a hard gate is `fail` or `unknown`) |
| `4` | Auth error |
| `5` | Provider or runtime error |

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
X-Latent-Signature: <hmac>

{ "status": "succeeded", "result": { "connections": [] } }
```

The callback is signed, job-scoped and revoked when the job ends. The core never
writes to a user repository.

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
