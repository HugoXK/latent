# 0006 — Model adapter: strict JSON, grade C, no silent fallback

- Status: accepted
- Date: 2026-11-25
- Decision owner: HugoXK

## Context

The deterministic `TemplateReconstructor` makes the pipeline testable, but it
cannot develop a real fragment. A model can. The risk is equally clear: a fluent
model will fill gaps, invent a citation, or present a guess as a fact. The ledger
already has the rule — a claim without a source is `inferred` or `unknown` — but a
model adapter can bypass it unless the adapter enforces it.

## Decision

- **One port, two adapters.** `ModelReconstructor` implements the same
  `Reconstructor` port as the template. The template remains the default
  (`LATENT_RECONSTRUCTOR=template`) and the offline test adapter.
- **OpenAI-compatible.** A POST to `${baseUrl}/chat/completions` with a system
  prompt, a user prompt, and `response_format: { "type": "json_object" }` by
  default. `LATENT_MODEL_JSON_MODE=false` disables the response format for a
  provider that rejects it.
- **Strict JSON contract.** Exactly one hypothesis per variant (three total);
  assumptions non-empty; claims non-empty; every claim `inferred` or `unknown`;
  every `confidence_basis` is `"C"`. The adapter rejects anything else.
- **Repair once, then fail.** An invalid response gets one repair prompt that
  includes the validation error. A second failure is
  `MODEL_INVALID_OUTPUT`. There is **no silent fallback** to the template: a model
  failure is an error, not a fake success.
- **A model is not a source.** A `verified` claim from a model is rejected. If the
  fragment or a retrieved source supports a claim, the ledger verifier upgrades it
  later; the model cannot do it.
- **Explicit provider, explicit data.** A private fragment is sent only to a
  provider the user configured. The adapter reads `LATENT_MODEL_BASE_URL`,
  `LATENT_MODEL_API_KEY`, `LATENT_MODEL_NAME`.

## Consequences

- Every model reconstruction is grade C until evidence is attached. That is the
  honest starting point.
- A malformed response costs one extra call; a persistent failure stops the job
  with a typed error.
- The adapter is testable without a network with a fake `fetchImpl`, including the
  repair path and the "model cannot verify" rule.
- The prompt is a product surface: a change to it can change reconstruction
  quality, so it is a T2 change and needs an eval before it ships.
- A provider with a different response shape needs a small adapter, not a change
  to the core.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| Free-form prose | Not auditable; cannot map to claims, assumptions or variants |
| Let the model mark a claim `verified` | Violates cite-or-abstain; the model is not evidence |
| Silent fallback to the template | Hides a model failure and produces a fake success |
| A provider-specific SDK in the core | Couples the core; the HTTP contract is enough |
| No repair attempt | A single formatting mistake would discard a valid reconstruction |
