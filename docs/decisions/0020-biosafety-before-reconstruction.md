# 0020 — Enforce the BSL and dual-use classifier before reconstruction

- Status: proposed (T3; Security assessment and owner approval pending; frozen gate path)
- Date: 2026-11-28
- Owner: HugoXK
- Issue: #44 (this PR was #90; it is the revised attempt)

## Context

A topic-selection tool can suggest a dangerous direction. The rule-based biosafety
classifier existed and was unit-tested but was never called by the runtime. A
warning after reconstruction is too late; a model must not be asked to develop a
select agent or an enhancement direction.

The first wiring was opt-in per pack (`VerticalPack.biosafety === true`). Security's
assessment blocked it: the research pack is a registered, selectable pack without
the flag, so `{"vertical":"research"}` skipped the gate entirely. The lexical
matcher also missed `B. anthracis`, `gain-of-function`, non-English names and
homoglyphs.

## Decision

1. **The gate is pack-independent.** `develop()` calls the classifier for every
   pack before `reconstructor.reconstruct`. There is no opt-out; an opt-out would
   need its own ADR, owner approval and an audit trail. The iGEM and research packs
   both pass through the same screen.
2. **Refusal is hard.** A select agent, toxin or enhancement term is refused
   regardless of the team's BSL. A BSL-2 pathogen is allowed only when the team's
   BSL is at least the required level.
3. **The team BSL is an explicit input.** `DevelopInput.team_bsl` is set by the
   API (`bsl` in `POST /v1/ideas`) and the CLI (`--bsl`); when absent it falls back
   to the constraint answer for `lab.bsl`, then to 1. The default of 1 is a
   decision, not an accident: pathogen work without a declared clearance is
   refused, while an unanswered BSL-1 benign fragment still passes. A user who has
   BSL-2 must declare it; otherwise the safe default blocks.
4. **Normalisation precedes matching.** NFKC, lowercase, Cyrillic lookalike
   folding and punctuation/whitespace folding, over an explicit
   synonym/abbreviation table (`B. anthracis`, `gain-of-function`, `GOF`,
   `beulenpest`, `milzbrand`, `炭疽`, `功能获得`, ...). Empty text is benign and
   passes; it cannot carry a term.
5. **The input is the fragment plus string-valued constraints.** The classifier
   never sees a model prompt or a provider key. It is a lexical first-line screen,
   not a biosafety officer.
6. **The refusal is typed, content-free and persisted.** `BiosafetyError` carries
   the verdict; the CLI exits 1 with `BIOSAFETY_BLOCKED` and the API returns 422.
   The caller writes a `biosafety.refused` event with `category` and `bsl` only —
   never the fragment text or the matched terms. If that write fails, the command
   fails with the fragment id in the error; the write is not swallowed.
7. **A human appeal is manual.** No model or automatic override. Any change to the
   frozen gate path needs an ADR and owner approval.
8. **Tests cover** a select agent (reconstructor not called), a benign fragment,
   the research-pack bypass attempt, abbreviated/hyphenated/fullwidth/homoglyph
   forms, Chinese and German names, empty text, and a BSL-2 pathogen with and
   without `team_bsl: 2`.

## Migration note

None. No schema or stored-format change; `DevelopInput` gains an optional
`team_bsl`, and `VerticalPack.biosafety` becomes informational only (the gate no
longer reads it).

## Consequences

- No selectable pack can skip the screen; the research-pack bypass is closed.
- A BSL-2 pathogen proposal requires an explicit `bsl >= 2`; this is stricter than
  a warning and can surprise a user, but it is the safe default.
- Lexical matching still has false positives and false negatives; the term lists
  are explicit, the normalisation table is testable, and a biosafety officer's
  review remains authoritative.
- The appeal workflow is a conversation, not a UI; that is a follow-up.

## Alternatives considered

- **Warning only.** Rejected: a warning is not a hard gate for select agents.
- **Pack opt-in with the research pack exempt.** Rejected by Security: a selectable
  pack without the flag is a bypass.
- **Model as the classifier.** Rejected: non-deterministic, prompt-injectable and
  not a safety authority.
- **Override with a flag.** Rejected: a bypass is not a PASS; the owner reviews an
  appeal outside the tool.

## Risks

- The lexical lists can miss a novel phrasing; the normalisation table narrows the
  gap, and both dangerous and benign cases are in the suite.
- The classifier is not a substitute for institutional biosafety review.
- This is a T3 change to a frozen path; it is not merged without Security's
  assessment and owner approval.

## Rollback

Per file: delete `packages/core/src/biosafety.ts`; remove the import and the guard
from `develop.ts` (and `team_bsl`); remove the CLI/server `bsl` input and the
`biosafety.refused` catch blocks; remove the tests, this ADR and the changelog
fragment. Already-persisted verdicts are only `events` rows of type
`biosafety.refused` (category/bsl, content-free): they stay as inert audit history,
with no schema, table or migration to reverse. If policy requires, one
`DELETE FROM events WHERE type = 'biosafety.refused'` removes them; not needed to
roll back the code.
