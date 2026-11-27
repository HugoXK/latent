# 0020 — Enforce the BSL and dual-use classifier before reconstruction

- Status: proposed (T3, owner approval required; frozen gate path)
- Date: 2026-11-27
- Owner: HugoXK
- Issue: #44

## Context

A topic-selection tool can suggest a dangerous direction. The rule-based
biosafety classifier existed and was unit-tested but was never called by the
runtime. A warning after reconstruction is too late; a model must not be asked to
develop a select agent or an enhancement direction.

## Decision

1. **The pack opts in.** `VerticalPack.biosafety: true` runs the classifier before
   the reconstructor. The iGEM pack opts in; the research pack does not yet.
2. **Refusal is hard.** A select agent, toxin or enhancement term is refused
   regardless of the team's BSL. A BSL-2 pathogen is allowed only when the team's
   `lab.bsl` value is at least the required level. An unanswered BSL defaults to 1
   (fail closed for pathogen work).
3. **The input is the fragment plus string-valued constraints.** The classifier
   never sees a model prompt or a provider key. The repository's classifier is
   lexical and its term lists are explicit in the diff; it is a first-line screen,
   not a biosafety officer.
4. **The refusal is typed and content-free.** `BiosafetyError` carries the verdict;
   the CLI exits 1 with code `BIOSAFETY_BLOCKED` and the API returns 422. The
   `biosafety.refused` event records `category` and `bsl` only — never the
   fragment text or the matched terms.
5. **A human appeal is manual.** There is no model or automatic override. The
   owner can review the refusal outside the tool; any change to the frozen gate
   path needs an ADR and owner approval.
6. **Tests cover** a select agent (reconstructor not called), a benign fragment, a
   BSL mismatch with and without clearance, and a pack without the flag.

## Migration note

None. No schema or stored-format change. `VerticalPack` gains the optional
`biosafety?: boolean`; the iGEM pack sets it.

## Consequences

- An iGEM reconstruction can be refused before any model call.
- A BSL-2 pathogen proposal requires an answered `lab.bsl` of 2; this is stricter
  than a warning and can surprise a user, but it is the safe default.
- Lexical matching has false positives and false negatives. The term lists are
  intentionally explicit; a biosafety officer's review remains authoritative.
- The appeal workflow is a conversation, not a UI; that is a follow-up.
- The research pack needs its own explicit opt-in after a dual-use review.

## Alternatives considered

- **A warning only.** Rejected: a warning is not a hard gate for select agents.
- **A model as the classifier.** Rejected: non-deterministic, prompt-injectable
  and not a safety authority.
- **Override with a flag.** Rejected: a bypass is not a PASS; the owner must
  review an appeal.

## Risks

- The lexical lists can miss a novel phrasing; update them deliberately and test
  both dangerous and benign cases.
- The classifier is not a substitute for institutional biosafety review.
- This is a T3 change to a frozen path; it is not merged without owner approval.
