# Replay case plan

- Status: accepted
- Date: 2026-11-27
- Owner: HugoXK

The replay harness is the evaluation spine: a case hides the outcome, gives the
pre-season input and prior art, and scores the candidate, collision and gate
outputs. Five illustrative cases unblock development; twenty real cases are the
`v0.3` exit criterion. Every case is clearly labelled `illustrative: true` or
carries a source and consent record.

## Shipped illustrative cases

| Case | Vertical | Village | Focus |
|---|---|---|---|
| `replay_igem-illustrative-001` | iGEM | Diagnostics | Arsenic soil whole-cell biosensor |
| `replay_igem-illustrative-002` | iGEM | Diagnostics | RNA thermosensor paper strip for water |
| `replay_igem-illustrative-003` | iGEM | Foundational Advance | Modular antibiotic-free plasmid toolkit |
| `replay_igem-illustrative-004` | iGEM | Climate Crisis | Methane-oxidizing consortium for landfill cover |
| `replay_research-illustrative-001` | research | Methods | Retrieval-augmented citation checking |

They live in `data/replay/fixtures/valid/` and must pass both
`latent eval validate` and `latent eval replay`; `pnpm check` runs the suite.

## Twenty real cases

Target coverage: at least four iGEM Villages, one research proposal, one grant, one
startup idea. Each row needs a source, consent/licence, redaction note and a
reviewer. The table is a plan, not a claim that the case exists.

| # | Vertical | Village / field | Source | Consent / licence | Redaction | Status |
|---|---|---|---|---|---|---|
| 1 | iGEM | Diagnostics | Public team wiki, season N-2 | CC-BY wiki | Names, school | to source |
| 2 | iGEM | Diagnostics | Public team wiki, season N-2 | CC-BY wiki | Names, school | to source |
| 3 | iGEM | Foundational Advance | Public team wiki, season N-1 | CC-BY wiki | Names, school | to source |
| 4 | iGEM | Foundational Advance | Registry part history | iGEM Registry terms | Part ids | to source |
| 5 | iGEM | Climate Crisis | Public team wiki, season N-1 | CC-BY wiki | Names, school | to source |
| 6 | iGEM | Climate Crisis | Published paper + wiki | Publisher + CC-BY | Author names | to source |
| 7 | iGEM | Therapeutics | Public team wiki, season N-2 | CC-BY wiki | Names, school | to source |
| 8 | iGEM | Therapeutics | Published paper | Publisher | Author names | to source |
| 9 | iGEM | Food & Nutrition | Public team wiki | CC-BY wiki | Names, school | to source |
| 10 | iGEM | Bioremediation | Public team wiki | CC-BY wiki | Names, school | to source |
| 11 | iGEM | Conservation | Public team wiki | CC-BY wiki | Names, school | to source |
| 12 | iGEM | Infectious Diseases | Public team wiki, BSL-1 only | CC-BY wiki | Names, school | to source |
| 13 | iGEM | Software & AI | Public repository + wiki | Repo licence | Handles | to source |
| 14 | iGEM | Agriculture | Public team wiki | CC-BY wiki | Names, school | to source |
| 15 | iGEM | Biomanufacturing | Public team wiki | CC-BY wiki | Names, school | to source |
| 16 | iGEM | Art & Design | Public team wiki | CC-BY wiki | Names, school | to source |
| 17 | research | Methods | Public benchmark + paper | Paper + dataset licence | Author names | to source |
| 18 | research | Climate | Public dataset + paper | Dataset licence | Site names | to source |
| 19 | grant | Biomedical | Public funded abstract | Funder terms | Applicant names | to source |
| 20 | startup | Developer tools | Public launch + docs | Public web | Founder names | to source |

## Sourcing rules

- Prefer public, already-published work from at least one season before the
  cutoff. The hidden seed title/DOI must not appear in the fragment, constraints or
  prior art; `validateReplayCase` enforces this.
- A pre-publication or private case needs written consent from the owner. Store the
  consent record next to the case, not in the public repository.
- Redact personal names, school names, private URLs and any sequence that could
  identify a team. Keep the mechanism/interface/host/readout.
- Snapshot every source used for scoring; a replay references the snapshot hash.
- No fabricated citation. A source that cannot be verified is excluded or marked
  `unknown`.

## Evaluation

- Temporal cutoff is fixed per case; a reviewer must not use later knowledge.
- Two reviewers score independently; report disagreement rather than averaging it
  away. A third reviewer breaks a tie.
- Score candidate recovery, collision precision/recall and gate agreement; record
  the harness output and the reviewer notes.
- Re-run the suite when a case, the vertical pack or the classifier changes.
- The `v0.3` exit criterion is 20 real cases with a recorded panel result; the five
  illustrative cases do not count toward it.
