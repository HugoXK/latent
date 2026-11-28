# 0020 — Enforce the BSL and dual-use classifier before reconstruction

- Status: accepted (T3; owner approval recorded 2026-11-28; frozen gate path)
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

Review context for the normalisation rewrite: Security assessed the
format-character/insertion class as an **S3 note — hardening, not blocker**.
Review Lead's probes then showed `an thrax`, zero-width space/joiner, newline/tab
and Greek `ο` all returning `allowed=true`; on that evidence the reviewer escalated
the class to blocking, and the Lead decided to fix the whole class once in this PR.
Security's `ok` was for `815fc375` and rated the then-known finding S3; the final
record should not read as if Security approved a screen with a known bypass.

## Decision

1. **The gate is pack-independent.** `develop()` calls the classifier for every
   pack before `reconstructor.reconstruct`. There is no opt-out; an opt-out would
   need its own ADR, owner approval and an audit trail. The iGEM and research packs
   both pass through the same screen.

   `checkBiosafety`'s `classifier` parameter is a testability seam only;
   `develop()` is the sole enforcement point and always constructs the
   rule-based classifier. Any pipeline that calls `checkBiosafety` directly with a
   permissive classifier is bypassing the gate by choice and is out of contract.
2. **Refusal is hard.** A select agent, toxin or enhancement term is refused
   regardless of the team's BSL. A BSL-2 pathogen is allowed only when the team's
   BSL is at least the required level.
3. **The team BSL is an explicit input.** `DevelopInput.team_bsl` is set by the
   API (`bsl` in `POST /v1/ideas`) and the CLI (`--bsl`); when absent it falls back
   to the constraint answer for `lab.bsl`, then to 1. The default of 1 is a
   decision, not an accident: pathogen work without a declared clearance is
   refused, while an unanswered BSL-1 benign fragment still passes. A user who has
   BSL-2 must declare it; otherwise the safe default blocks.
4. **One skeleton precedes matching, on both sides.** `skeleton(text)` runs
   NFKD and drops combining marks, lowercases, **deletes** the format/invisible
   class (U+00AD, U+180E, U+200B–U+200F, U+2060, U+FEFF — never mapped to a
   space, which would split a term), maps a codepoint confusable table to Latin
   (Cyrillic plus the common Greek `ο α ε ι ρ ν κ τ υ χ`; this is a table, not a
   claim of completeness) and collapses punctuation to one space. **The term
   lists are normalised by the same function at module init**, so a hyphenated
   term such as `sars-cov-2` cannot go dead. A compact form (spaces removed) is
   matched in addition to the spaced form, only for terms whose compact form is
   at least 5 characters — so `an thrax` matches `anthrax`, while the short `gof`
   keeps spaced matching only (the false-positive consequence is recorded under
   Risks). Empty text is benign and passes; it cannot carry a term.
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
`team_bsl`. `VerticalPack.biosafety` is removed; there is no per-pack flag to
misread.

## Consequences

- No selectable pack can skip the screen; the research-pack bypass is closed.
- A BSL-2 pathogen proposal requires an explicit `bsl >= 2`; this is stricter than
  a warning and can surprise a user, but it is the safe default.
- Lexical matching still has false positives and false negatives; the term lists
  are explicit, the normalisation table is testable, and a biosafety officer's
  review remains authoritative.
- The appeal workflow is a conversation, not a UI; that is a follow-up.
- **Known accepted limitation, decided:** bare species epithets (`anthracis`,
  `pestis`, `tularensis`, `botulinum`) classify as benign in this version
  **deliberately**, because a bare-epithet term list would false-positive on
  legitimate discussion (a literature review, a taxonomy note). The term list
  carries full names and common abbreviations. This PR does not widen it; a
  future change would need the false-positive cases measured first. The classifier
  is a first-line screen, not a substitute for a BSL review or a biosafety
  officer.

## Alternatives considered

- **Warning only.** Rejected: a warning is not a hard gate for select agents.
- **Pack opt-in with the research pack exempt.** Rejected by Security: a selectable
  pack without the flag is a bypass.
- **Model as the classifier.** Rejected: non-deterministic, prompt-injectable and
  not a safety authority.
- **Override with a flag.** Rejected: a bypass is not a PASS; the owner reviews an
  appeal outside the tool.

## Risks

- Compact matching is limited to terms of at least 5 characters. The `gof` term
  therefore matches only as a spaced word; a `gof` substring inside another token
  is not matched. This is accepted rather than solved here.
- There is no CLI-level biosafety test in this PR (the server and core paths are
  covered); a CLI e2e is a follow-up.
- The #17 replay fixtures and plan in the diff are inherited from the stack; they
  are data/docs only and not part of the safety path.

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
