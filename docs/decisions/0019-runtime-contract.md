# 0019 — HTTP runtime contract, runtime-scoped token and signed callbacks

- Status: accepted (T3; owner approval recorded 2026-11-28; Security re-assessment at the fix head is the gate)
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
3. **Configuration is fail-closed.** `runtimeFromEnv` accepts only the empty kind
   with a URL pair, `flybot`, `none` and `local`; any other value (a typo such as
   `htpp`) throws `RUNTIME_CONFIG_INCOMPLETE` and never falls through to HTTP.
   `flybot` (or a URL pair) without both URL and token also throws. A configured
   runtime that fails marks the job `failed`; the CLI does not silently fall back
   to a local success.
4. **Transport is TLS-only.** The base URL must be `https:`, except loopback
   (`localhost`, `127.0.0.1`, `::1`) or an explicit test-only
   `allowInsecureHttp`; userinfo is rejected, and every request uses
   `redirect: "error"` so the Bearer token cannot follow a redirect. The callback
   URL is validated with the same rules, so results cannot be posted to a
   plaintext endpoint.
5. **Callbacks are job-scoped, canonical and replay-safe.** The root secret is
   shared out of band and must be at least 16 characters. The key id is part of
   the signed data: the job secret is
   `HMAC-SHA256(root, "latent-callback:" + key_id + ":" + job_id)`. The signature
   covers a domain separator plus length-prefixed `key_id`, `job_id`, `timestamp`,
   `nonce` and raw body, so different field pairs cannot collide. The verifier
   rejects a bad signature, another job, a missing/oversized nonce, a timestamp
   more than 5 s in the future, and one older than 300 s. The verifier **requires**
   a seen-nonce set: a stateless call throws `CALLBACK_GUARD_REQUIRED`, because it
   would accept a replay. The callback route must persist the set (or
   `callbackSignatureHash`) against the job's terminal state and pass it in; the
   check-and-add is synchronous inside the process. It compares in constant time.
6. **The payload is a descriptor, not a data channel.** `schedule()` accepts only
   `seed {type,id}`, `budget` and `since`, rejects unknown fields (notably private
   fragment text) and caps the serialized payload at 64 KiB. The callback object is
   added by the adapter, not the caller.
7. **Key rotation is by key id.** A new root secret gets a new `key_id`; callbacks
   signed with an old key id fail verification. The callback route should accept a
   configured set of active key ids during a rotation window.
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
- A clock skew larger than the 5 s future allowance rejects a valid callback.
- Replay rejection is only durable if the callback route persists the nonce or
  signature hash; the adapter's in-process set is a guard, not a distributed
  store.
- Rotating the root secret invalidates outstanding callbacks signed with the old
  key id; that is deliberate.
- A runtime can still run a job without calling back; the job lease/expiry policy
  is a later piece.
