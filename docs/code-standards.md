# Code standards

- Status: accepted
- Date: 2026-11-25
- Owner: HugoXK

These rules bind humans and AI agents. When a rule and a convenience conflict, the
rule wins. See also [../AGENTS.md](../AGENTS.md) and [../CONTRIBUTING.md](../CONTRIBUTING.md).

## 1. Schemas are the source of truth

- `data/schemas/*.schema.json` is canonical. Runtime types are generated from it,
  never hand-written and then "kept in sync".
- A schema change needs:
  1. an ADR in `docs/decisions/`;
  2. a migration note (old → new, and what happens to stored data);
  3. at least one fixture per new required field;
  4. a validator test that fails on the old shape.
- The schema version is in `$id`; the API version is independent.

## 2. Never fabricate evidence

- A claim is `verified` only if a source span supports it and a verifier passed.
- A missing source is `inferred` or `unknown`. A fluent sentence is not evidence.
- A test that asserts a model output must use a fixture or a fake. Never call a
  live provider in CI.
- A doc example must be real or clearly labelled "illustrative".

## 3. Determinism

- The same input, fixtures and seed produce the same output.
- Randomness is seeded and recorded.
- Model calls are recorded as a fixture (request hash → response) for replay.
- Time is injected; never call `Date.now()` in core logic without a clock port.

## 4. Tests first

- A bug fix starts with a failing test on the unbroken tip, then the fix. Keep both
  halves in the PR.
- Required suites:
  - **schema**: every fixture validates;
  - **ledger**: fabricated citation, contradiction, unit mismatch;
  - **gate**: a hard gate cannot be waived by a model;
  - **replay**: at least one historical case per vertical;
  - **adversarial**: prompt injection in retrieved text, plausible fake objects;
  - **e2e**: fragment → brief with fakes, no network.
- A skipped test carries a reason and an issue number.

## 5. Small, reviewable changes

- One issue → one branch → one PR. If an issue already has a PR, push there.
- A PR that changes behaviour includes the test, the doc and the changelog fragment.
- Do not mix a refactor with a behaviour change; split them.

## 6. Risk tiers

Computed from the diff and the touched paths, never from a label.

| Tier | Examples | Merge rule |
|---|---|---|
| **T0** | Docs, comments, fixtures | Green CI |
| **T1** | A new vertical pack, a new adapter, a UI string | Green CI + one review |
| **T2** | Ledger, verifier, gate engine, schema with a migration | Green CI + a PASS at the tip + an ADR |
| **T3** | Auth, encryption, the promotion rule, a frozen path | Green CI + a PASS at the tip + owner approval |

A new commit voids a PASS. A PASS names what was run (`Ran: ...`).

## 7. Review format

A review states:

1. what changed and why;
2. what was run, and what was not run;
3. the evidence (test names, commands, output);
4. the risk tier and the reason;
5. open questions and follow-ups.

"Looks good" is not a review. A reviewer who did not run the change says so.

## 8. TypeScript and Node

- Node **22.9+**, ESM, `strict` TypeScript, no `any` without a comment.
- Prefer `node:` built-ins; `node:sqlite` for the store.
- Validation at the boundary with the schema; no untyped JSON in the core.
- Errors are typed and carry a stable code; no stringly-typed control flow.
- No top-level side effects in a library module.

## 9. Ports and adapters

- The core imports a port, never a vendor SDK.
- An adapter lives outside the core and has its own tests with fakes.
- A port has a contract test that every adapter must pass.
- The ledger, verifiers, gate engine and promotion rule are frozen paths.

## 10. Security

- No secrets in git, logs, tests, fixtures or screenshots.
- Input is validated at the boundary; retrieved content is untrusted data.
- Do not add a tool that retrieved text can call.
- A model provider receives a private fragment only with explicit consent.
- A science vertical runs through the biosafety classifier before any suggestion.

## 11. Documentation

- Both READMEs and any user-facing copy stay in step (Chinese and English).
- A claim in a doc about "what exists" links to the file or the source.
- The status line is honest: spec, alpha, beta, stable.
- Every ADR has Status, Date, Owner, Context, Decision, Consequences.

## 12. Definition of done

A change is done when:

- the schema (if any) is updated and validated;
- the test fails before and passes after;
- the ledger/gates behave as specified;
- docs and both READMEs are updated if user-facing;
- the changelog fragment exists;
- CI is green at the tip;
- the risk tier is recorded.
