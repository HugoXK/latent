## What and why

<!-- One paragraph. Link the issue. -->

Closes #

## Evidence

<!-- What you ran, and what you did not run. Paste the command and the result. -->

```
Ran:
Not run:
```

## Risk tier

<!-- T0–T3 from docs/code-standards.md, and why. -->

- [ ] T0 — docs / comments / fixtures
- [ ] T1 — vertical pack / adapter / UI string
- [ ] T2 — ledger / verifier / gate engine / schema with a migration
- [ ] T3 — auth / encryption / promotion rule / frozen path

## Checklist

- [ ] A failing test existed before the fix (bug fixes).
- [ ] Schemas validate; fixtures cover new required fields.
- [ ] No fabricated evidence; every new claim has a source or is marked unknown.
- [ ] No hard gate can be waived by a model.
- [ ] Docs and both READMEs updated if user-facing.
- [ ] Changelog fragment in `changelog.d/`.
- [ ] No secrets, private fragments or copied assets.
- [ ] If a required check or the reviewer is unavailable, I left a comment naming
      it and did not bypass protection.
