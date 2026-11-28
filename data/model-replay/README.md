# Model replay fixtures

`LATENT_MODEL_REPLAY=1` runs the model adapter without a provider. The request key
is a SHA-256 over `model`, `temperature`, `messages` and `response_format`; it is
the **file name**, not a field in the JSON, so a fixture never repeats a
high-entropy hash. The messages are hashed, never stored. A missing fixture is a
`ModelReplayError` (`REPLAY_FIXTURE_MISSING`), never a network fallback.

```sh
LATENT_RECONSTRUCTOR=model \
LATENT_MODEL_REPLAY=1 \
LATENT_MODEL_REPLAY_DIR=data/model-replay \
LATENT_MODEL_NAME=<model> \
LATENT_MODEL_TEMPERATURE=0 \
pnpm latent develop <fragment-id>
```

A private fragment is refused in replay: nothing leaves the machine, but a
fixture file name is a fingerprint of the request, so private content is never
recorded.

## Fixture format

```json
{
  "model": "replay-model",
  "temperature": 0,
  "redacted": false,
  "response": {
    "choices": [{ "message": { "content": "..." } }]
  }
}
```

`response` is the raw OpenAI-compatible envelope. The request messages are not
stored.

## Record

Use `writeModelReplayFixture({ dir, requestBody, response, redact })` from
[`packages/adapters/src/model-reconstructor.ts`](../../packages/adapters/src/model-reconstructor.ts).
It computes the key, replaces every string in `redact` with `[redacted]`, and
writes `<key>.json`. A CLI is not shipped yet.

## Sample

No fixture is committed. `data/model-replay/` holds local, untracked fixtures for
public content only; recording a private fragment is refused by the adapter.
