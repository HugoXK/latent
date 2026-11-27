# 0012 — Adversarial injection and exfiltration tests

- Status: proposed (T2)
- Date: 2026-11-27
- Owner: HugoXK
- Issue: #57

## Context

Retrieved content and user fragments are untrusted. The model adapter already
refuses a private fragment unless `LATENT_MODEL_SEND_PRIVATE=true` and tells the
model that the fragment is data, but that contract had no adversarial test. Error
messages also included up to 500 characters of the provider's HTTP response, which
could echo the fragment and reach a log.

## Decision

1. **A deterministic suite** at
   `packages/adapters/test/injection.test.ts` asserts:
   - an injected fragment is JSON-encoded as data; the request carries no `tools`
     or `functions`, and the system message states the data-only rule;
   - the injected and benign fragments produce the same output for the same fake
     response (the injection changes nothing in the adapter contract);
   - a private fragment is refused before `fetch` is called;
   - a `public` fragment may be sent without the private switch;
   - provider HTTP errors are redacted against the fragment content and the API
     key before they leave the adapter;
   - a recorded replay fixture drops request messages and recursively redacts the
     supplied secrets;
   - every file under `data/fixtures/` and `data/replay/fixtures/` is scanned for
     high-signal secret shapes (private key, OpenAI/GitHub/AWS/Slack/Google keys,
     bearer tokens).
2. **Redaction is a boundary rule.** `ModelReconstructor` sanitises
   `ModelReconstructionError.message` with the fragment content and API key. The
   error code is preserved; the text carries `[redacted]`.
3. **Fixtures never contain the request messages.** `writeModelReplayFixture`
   stores only `model`, `temperature`, `redacted` and the response; `redact`
   strings are replaced recursively.
4. **The suite runs in `pnpm check`.** It is offline and uses a fake `fetch`.

## Migration note

None. No schema, table or stored format changes.

## Consequences

- The adapter has a tested refusal path and a tested redaction path.
- The fixture scan is a deterministic guard, not a replacement for gitleaks,
  dependency audit or the release SBOM (#14).
- Redaction can hide diagnostics. The stable error code remains; a developer can
  reproduce with a local fixture and inspect it outside the log.
- The data-only rule is structural (JSON encoding, system prompt, no tools); it is
  not a proof against a compromised provider or a model that disobeys.

## Alternatives considered

- **Rely on gitleaks alone.** Rejected: it does not test instruction following,
  private-refusal or the redaction path.
- **Add a model judge for injection.** Rejected: non-deterministic and expensive in
  CI.
- **Keep the provider response body in errors.** Rejected: it is an exfiltration
  path when the provider echoes the prompt.

## Risks

- The secret-pattern list can miss a novel token format; add patterns as providers
  change.
- A test fixture must never contain a real secret; the scan is the guard.
