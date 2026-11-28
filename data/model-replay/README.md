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

## Offline is not the same as safe to commit

The file name is a deterministic hash of the request messages, so it is a stable
content fingerprint of the fragment, not an anonymous id. A fixture recorded from
a private fragment would therefore join that idea to a public git history forever,
even though replay never touches the network.

The rules:

- **Replay of a private fragment still needs the explicit opt-in.** The replay
  branch uses `LATENT_MODEL_SEND_PRIVATE=true` exactly like the live branch; the
  default is deny.
- **A private fragment is never recorded under `data/`.** `writeModelReplayFixture`
  refuses `privacy: "private"` when the target directory resolves inside the
  repository's committed `data/` tree, even with `allowPrivate: true`.
- **A committed fixture must be redacted.** An unredacted write under `data/` is
  refused (`REPLAY_UNREDACTED_IN_COMMITTED_PATH`); pass `redact` with every string
  that must not be stored.
- **Private content outside `data/` needs a per-call opt-in.** `allowPrivate: true`
  on the call is the only way to record it, and only into a scratch directory.
- **`privacy` defaults to `"private"`.** A caller must say `privacy: "public"` to
  record public content, so forgetting a flag fails closed.

## Fixture format

```json
{
  "model": "replay-model",
  "temperature": 0,
  "redacted": true,
  "response": {
    "choices": [{ "message": { "content": "..." } }]
  }
}
```

`response` is the raw OpenAI-compatible envelope. The request messages are not
stored.

## Record

Use `writeModelReplayFixture({ dir, requestBody, response, redact, privacy, allowPrivate })`
from [`packages/adapters/src/model-reconstructor.ts`](../../packages/adapters/src/model-reconstructor.ts).
It computes the key, replaces every string in `redact` with `[redacted]`, and
writes `<key>.json` only after the privacy and committed-path checks pass. A CLI
is not shipped yet.

## Sample

No fixture is committed. `data/model-replay/` only holds this README; the format is
exercised by
[`packages/adapters/test/model-replay.test.ts`](../../packages/adapters/test/model-replay.test.ts)
in scratch directories, and a missing fixture stays a typed error.
