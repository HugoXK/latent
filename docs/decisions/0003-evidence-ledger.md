# 0003 — Evidence ledger and cite-or-abstain

- Status: accepted
- Date: 2026-11-25
- Decision owner: HugoXK

## Context

A fluent model output is not evidence. In an idea-development product, the most
dangerous failure is not an obvious error — it is a **plausible sentence that the
model invented** and that the user then builds a year on. The literature is clear
that LLM ideas can be novel and still infeasible, and that under-specification is a
separate failure (see [../prior-art.md](../prior-art.md)).

We need a representation that makes "known", "inferred" and "unknown" visible, and
a verifier that can block a brief.

## Decision

### The claim is the atom

Every factual statement in an idea or a brief is a `Claim`:

```json
{
  "id": "clm_01h...",
  "text": "The detection limit of the incumbent ELISA is 10 ng/mL",
  "value": 10,
  "unit": "ng/mL",
  "conditions": { "matrix": "serum", "temperature_c": 25 },
  "status": "verified",
  "confidence": 0.86,
  "confidence_basis": "A",
  "sources": [
    {
      "kind": "paper",
      "url": "https://...",
      "span": "the limit of detection was 10 ng/mL",
      "snapshot_hash": "sha256:...",
      "accessed_at": "2026-11-20T00:00:00Z"
    }
  ]
}
```

### Statuses

| Status | Meaning | May appear in a compiled brief? |
|---|---|---|
| `verified` | A source span supports it and a verifier passed | Yes |
| `inferred` | The system derived it; the derivation is recorded | Yes, labelled |
| `unsupported` | No source, or a verifier failed | No |
| `unknown` | We looked and did not find an answer | Yes, in "what we don't know" |
| `contradicted` | A source says the opposite | Yes, with the contradiction |

### Confidence basis

- `A`: peer-reviewed characterisation (dose response, kinetics, orthogonality).
- `B`: iGEM wiki or Registry data only.
- `C`: sequence only, no functional data.
- `expert`: a named human expert, with the date and the statement.

A `C` component is budgeted as "re-characterise", never as "use as is".

### Verifiers

Four checks run before compilation:

1. **Citation support**: does the span actually support the claim? A URL is not
   enough. The check uses a span-level entailment verifier plus a sampled human
   audit.
2. **Numeric consistency**: unit normalisation, order-of-magnitude bounds,
   arithmetic.
3. **Existence**: part, paper, company or dataset exists in the vertical's registry.
4. **Contradiction**: a search for sources that say the opposite.

A failed check demotes the claim and blocks the brief.

### Freeze

The ledger schema, the verifiers and the demotion rule are **frozen paths**. An
AgentDescent-style evolution candidate may not modify them; a change requires an ADR
and owner approval.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| A vector store with "sources" as metadata | A similarity score is not support; it cannot block a brief |
| A per-source trust score only | A trusted source can still be misquoted; span support is required |
| Human-only verification | Does not scale and is applied inconsistently |
| Confidence as a single model-generated number | Uncalibrated and unauditable; needs a basis and an outcome |

## Consequences

- A brief can fail to compile. That is correct: an unsupported brief is worse than
  no brief.
- `unknown` is a first-class, visible output. The product is honest about gaps.
- Every claim carries a snapshot hash; a changed source can be detected and the
  claim re-verified.
- The ledger adds friction to generation. That friction is the product.

## Amendment — 2026-11-28: what counts as span support

- Context: #93 verdicts at `75310c46` (APPROVED 2026-11-28T01:38:19Z and
  2026-11-28T01:39:43Z) found `supports()` marking a span as support on a
  two-token overlap, including cases where the span stated the **opposite
  polarity**
  ("does not respond" vs "responds") or named a **different chassis**
  ("in B. subtilis" supporting a claim "in E. coli"). Both are fabricated
  evidence under AGENTS.md rule 2, not a tuning preference.
- Decision: `DeterministicClaimVerifier` marks a span as support only when all of
  these hold: (a) at least two claim terms are shared and at least 60% of the
  claim's terms are covered; (b) the claim and the span agree on negation
  polarity; (c) when both name a chassis or species, at least one matches.
- Limits (accepted, recorded): the negation cue list and the chassis alias list
  are curated English/small; a span that names no host is not treated as a
  contradiction; an unknown host is not compared. `ModelClaimVerifier` remains
  the escape hatch for text these heuristics cannot judge.
- Evidence: `packages/core/test/verifier.test.ts` carries the three
  counterexamples (two-term overlap, polarity inversion, chassis swap) and each
  failed before this amendment and passes after it.
- Reconsider when: the corpus stops being English, the chassis list drifts, or a
  third-party evidence format needs different rules.
