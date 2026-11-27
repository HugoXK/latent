# Runtime contract (FlyBot-compatible)

- Status: implemented (`v0.4`), live FlyBot integration is operator work
- Date: 2026-11-27
- Owner: HugoXK

Latent schedules incubation through the `AgentRuntime` port. The shipped
`HttpAgentRuntime` implements a small HTTP contract that FlyBot or another
scheduler can expose. The core sends a job descriptor, never a model key.

## Configuration

```sh
LATENT_RUNTIME=flybot          # or none/local for the in-process no-op
LATENT_RUNTIME_URL=https://flybot.example
LATENT_RUNTIME_TOKEN=<runtime-scoped token>
LATENT_CALLBACK_URL=https://latent.example/v1/jobs/callback
```

`LATENT_RUNTIME=none` (or empty) uses the local no-op runtime. Setting `flybot`
without both the URL and token throws `RUNTIME_CONFIG_INCOMPLETE`; there is no
silent fallback. The CLI records a failed job if the runtime rejects or times out.

## Endpoints

```http
POST /v1/jobs
Authorization: Bearer <runtime token>
Idempotency-Key: <job id>
Content-Type: application/json

{
  "id": "job_01h...",
  "kind": "incubate",
  "payload": {
    "seed": { "type": "idea", "id": "idea_01h..." },
    "budget": 5,
    "since": null,
    "callback": {
      "url": "https://latent.example/v1/jobs/callback",
      "job_id": "job_01h..."
    }
  }
}
```

```json
{ "ref": "fly_job_01h..." }
```

```http
POST /v1/jobs/{ref}/cancel
Authorization: Bearer <runtime token>
```

The adapter accepts `{ "ref": "..." }` or `{ "id": "..." }`. A non-2xx response
is `RUNTIME_HTTP_ERROR`; a missing ref is `INVALID_RUNTIME_RESPONSE`; a timeout is
`RUNTIME_TIMEOUT`. The token is redacted from error text.

## Signed callback

The runtime (or the process that owns the result) signs the raw body:

```text
job_secret = HMAC-SHA256(root_secret, "latent-callback:" + job_id)
signature  = HMAC-SHA256(job_secret, job_id + "." + timestamp + "." + raw_body)
```

Send `X-Latent-Timestamp` and `X-Latent-Signature`. Verify with:

```ts
import { verifyJobCallback } from "@latent/adapters";

const ok = verifyJobCallback({
  secret: process.env.LATENT_CALLBACK_SECRET!,
  jobId,
  timestamp,
  body: rawBody,
  signature,
});
```

A wrong job id, a tampered body and a timestamp older than 300 seconds are
rejected. The comparison is constant-time. The HTTP callback route is a follow-up;
the signing and verification functions ship now.

## Boundary

- The runtime receives the runtime-scoped token and a job descriptor.
- The model key, private fragment text and user token never enter the adapter.
- A runtime failure marks the job `failed` and records a `job.failed` event.
- CI uses a fake fetch and the recorded fixture
  `data/fixtures/runtime/flybot-contract.json`; it does not call a live FlyBot.
