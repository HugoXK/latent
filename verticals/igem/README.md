# iGEM vertical pack

- Status: spec (`v0.1`)
- Owner: HugoXK

The first vertical. It turns a broad direction ("environment / health / materials")
into a project that finishes in one season, produces data, and can win a medal.

The full specification is [../../docs/vertical-igem.md](../../docs/vertical-igem.md).
This file is the pack's own README: what it contains and how to add another.

## What a pack contains

| Part | File | Notes |
|---|---|---|
| Variables | this README, "Interview variables" | Dotted names, used by the interviewer |
| Evidence scale | this README, "Evidence scale" | A / B / C, with budget implications |
| Gates | this README, "Gates" | Criteria, falsifier, fallback |
| Compiler template | [`brief.md`](brief.md) | One page, conclusion first |
| Corpus adapters | runtime (`v0.2`) | Registry, iGEM history, PubMed/Europe PMC, bioRxiv |
| Replay cases | runtime (`v0.3`) | Historical seasons with the outcome hidden |

## Interview variables

- `team.size`, `team.years`, `team.wet`, `team.dry`
- `lab.bsl`, `lab.readers`, `lab.flow`, `lab.hplc`
- `lab.strains`, `lab.plasmids`, `lab.synthesis_reimbursed`
- `budget.total`, `budget.sponsor`
- `time.lab_open`, `time.summer_weeks`
- `problem.who`, `problem.cost`, `problem.workaround`
- `skill.want`
- `nogo.pathogen`, `nogo.animal`, `nogo.radio`, `nogo.human_samples`
- `asset.school`, `asset.advisor`, `asset.clinic`
- `candidate.a`, `candidate.b`, `candidate.c`
- `success.definition`

## Evidence scale

| Grade | Meaning | Budget |
|---|---|---|
| **A** | Peer-reviewed characterisation (dose response, kinetics, orthogonality) | Reuse, verify in host |
| **B** | iGEM wiki or Registry data only | Re-characterise |
| **C** | Sequence only | Build and characterise from scratch |

## Gates

| # | Gate | If it fails |
|---|---|---|
| 1 | A measurable readout with a dose response | Kill |
| 2 | BSL-1, or the team has BSL-2 clearance | Change host |
| 3 | No unvalidated de novo protein design in the core | Demote |
| 4 | One DBTL loop in 6–8 weeks | Reduce scope |
| 5 | ≥ 2× better than the incumbent; enabling tools compared to the absence of the workflow | Change the problem |
| 6 | A real external stakeholder | Add Human Practices |
| 7 | Something shareable (part, protocol, software, hardware, data) | Add Contribution |

Every gate has a falsifier, controls, n, statistics and a fallback. A hard gate is
decided by a human.

## Rules

The 2026 anchors (Villages, medals, Special Awards) are in
[../../docs/vertical-igem.md](../../docs/vertical-igem.md). They change every year;
the runtime loads them from a versioned config with a checked date.

## Add another vertical

1. Copy the shape of this pack: variables, evidence scale, gates, template.
2. Write the spec in `docs/vertical-<name>.md`.
3. Add a replay case with the outcome hidden.
4. Do not add model-specific logic; a pack is data plus a template.
5. Open an issue with the user problem and how the vertical will be evaluated.
