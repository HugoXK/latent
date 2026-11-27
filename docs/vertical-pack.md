# Vertical pack

A vertical pack is the data a domain supplies: variables, questions, gates and a
brief template. The core has no `if vertical === "igem"` branch. The iGEM pack is
the first proof; a second vertical is a new pack, not a fork.

The type lives in [`packages/core/src/vertical.ts`](../packages/core/src/vertical.ts);
the validator is [`packages/core/src/pack.ts`](../packages/core/src/pack.ts).

## Contract

- `id`, `name` and `briefTemplate` are non-empty.
- Variable names are unique.
- Question ids and question variables are unique; every question variable is
  declared in `variables`.
- A `single` or `multi` question has options; option values are unique and every
  option has a label.
- A `text` question may have no options.
- A `dependsOn` entry names a declared variable; if that variable has options,
  `equals` must match one of them.
- At least one gate; gate keys are unique; every gate has a name, criteria and
  falsifier; `fallback` is one of `change_readout`, `change_host`,
  `reduce_scope`, `compute_only`, `none`.

## Validate

```ts
import { assertValidPack } from "@latent/core";
import { igem } from "@latent/vertical-igem";

assertValidPack(igem);
```

`validateVerticalPack(pack)` returns every issue as `{ code, path, message }`;
`assertValidPack` throws `PackValidationError`. The iGEM pack test calls it, so a
broken pack fails CI.

## Authoring a new pack

1. Decide the constraints the interviewer must know. Put each one in `variables`.
2. Write the questions. Use `single` for a choice, `multi` for a set (equipment,
   no-go areas), `text` for a candidate or a sentence. Add `allowOther` when the
   list is not exhaustive.
3. Add `dependsOn` only when a question is meaningless without another answer.
4. Write the gates: a criterion, a falsifier, a fallback. A gate without a
   falsifier is not a gate.
5. Add a brief template and one illustrative replay case.
6. Run `assertValidPack` and the replay harness.

## The second pack

`@latent/vertical-research` exports `research`; `@latent/verticals` is the registry
(`verticalById`, `listVerticals`). The CLI selects it with `--vertical research`
(`develop`, `priors`); the API accepts `{ "vertical": "research" }` and
`GET /v1/priors?vertical=research`. The replay case is
`data/replay/fixtures/valid/research-illustrative-001.json`.

`compileIgemBrief` is an app-level extra for iGEM (components, timeline, material
balance). Every other pack uses the generic compiler plus
`verticalRulesValidator`, so the core has no pack branch. The pack owns its
variables, questions, falsifiers, evidence scale and optional dated rules.

## What a pack does not own

A pack does not own the ledger, the verifier, the gate engine or the compiler. It
supplies data to them. That boundary is what lets the second vertical reuse the
core instead of copying it.
