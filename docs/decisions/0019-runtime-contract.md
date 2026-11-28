# 0019 — HTTP runtime contract, runtime-scoped token and signed callbacks

- Status: proposed (T2)
- Date: 2026-11-27
- Owner: HugoXK
- Issue: #55

## Context

Incubation needs a long-lived runtime. FlyBot is the sibling project, but the
local FlyBot checkout does not expose a stable job HTTP API. The core must still
use `AgentRuntime` through a port, fail closed when a configured runtime is
unreachable, and never receive a user model/provider key. A runtime callback must
be attributable to one job and resist replay.

## Decision

1. **A small HTTP contract** (implemented by `HttpAgentRuntime`):
   - `POST {base}/v1/jobs` with `{ id, kind, payload }` and a
     `Idempotency-Key: <job id>` header → `{ ref }` or `{ id }`;
   - `POST {base}/v1/jobs/{ref}/cancel` → 2xx.
2. **The token is runtime-scoped.** `LATENT_RUNTIME_TOKEN` is sent only to the
   runtime. The adapter never receives a model/provider key. The payload is the
   job descriptor (`seed`, `budget`, `since`, `callback`), not the user's private
   fragment text.
3. **Configuration is fail-closed.** `runtimeFromEnv` returns the in-process
   no-op only when `LATENT_RUNTIME` is empty/`none`/`local`; `flybot` (or a URL
   pair) without both URL and token throws `RUNTIME_CONFIG_INCOMPLETE`. A
   configured runtime that fails marks the job `failed`; the CLI does not silently
   fall back to a local success.
4. **Callbacks are job-scoped.** The root secret is shared out of band. The job
   secret is `HMAC-SHA256(root, "latent-callback:" + job_id)`; the signature is
   `HMAC-SHA256(job_secret, job_id + "." + timestamp + "." + raw_body)`. The
   verifier rejects a bad signature, a different job id, and a timestamp older
   than 300 seconds (configurable). It compares in constant time.
5. **The callback URL is explicit.** `LATENT_CALLBACK_URL` is placed in the job
   payload as `callback: { url, job_id }`. The HTTP callback route itself is a
   follow-up; the signing/verification utilities ship now.
6. **The contract is tested offline.** A fake runtime covers schedule, cancel,
   error, invalid response, timeout and idempotency. A recorded request/response
   fixture (`data/fixtures/runtime/flybot-contract.json`) is replayed against the adapter.
   Live FlyBot execution remains an operator integration, not a CI claim.

## Migration note

None. No schema or stored-format change. New environment variables:
`LATENT_RUNTIME`, `LATENT_RUNTIME_URL`, `LATENT_RUNTIME_TOKEN`,
`LATENT_CALLBACK_URL`.

## Consequences

- FlyBot (or any scheduler) can implement two endpoints without importing Latent.
- A missing or partial runtime configuration fails before a job is created.
- A runtime failure is recorded on the job and in the audit event.
- The raw-body callback route needs a content-type parser that preserves bytes;
  it is deliberately not half-implemented here.
- No retry/backoff policy yet; the idempotency key makes a retry safe to add.

## Alternatives considered

- **Import FlyBot internals.** Rejected: no stable API and a tight coupling.
- **Send the user's model key to the runtime.** Rejected: the runtime does not
  need it and the core must not hold it.
- **Unsigned callback URL.** Rejected: any local process could forge a result.
- **Fall back to the local engine on a runtime error.** Rejected: it hides a
  failure and can double-run a job.

## Risks

- The shared callback root secret must be rotated and stored like any secret.
- A clock skew larger than the tolerance rejects a valid callback; the tolerance
  is configurable.
- A runtime can still run a job without calling back; the job lease/expiry policy
  is a later piece.
