# Vertical: iGEM topic selection

- Status: spec (`v0.1`)
- Date: 2026-11-25
- Owner: HugoXK

iGEM is the first vertical because it is the strictest small world we could find:
a hard objective (a medal, one Design–Build–Test–Learn loop), a semi-structured
corpus (the Registry, team wikis, papers), a fixed calendar, and an annual
evaluation cycle. If the loop works here, it can be generalised.

> **Rules change every year.** The 2026 anchors below are a starting point, not
> authority. Re-check `competition.igem.org/judging/*` before relying on them. The
> runtime loads the rules from a versioned config with a checked date and warns
> when the date is stale.

## The job

Take a broad direction ("environment / health / materials") and compress it into a
project that:

1. can be finished in one season;
2. can produce data, not just a design;
3. can win a medal and a Special Award;
4. a team can actually build with its own hands, budget and lab.

## Five phases

Each phase has an exit condition. Do not enter the next phase until it is met.

| Phase | What happens | Exit condition |
|---|---|---|
| 1. Interview | Elicit hard constraints and direction, with guesses and confidence | One sentence: "for whom, what problem, what readout, what host", confirmed by the user |
| 2. Background | Quantify the problem, the incumbents and the gap | A Gap table with numbers, units and sources |
| 3. Components | Review iGEM history, the Registry and papers; classify A/B/C | A component table with reuse/re-characterise/build decisions and a collision report |
| 4. Feasibility | Define the MVP, controls, statistics, burden, orthogonality, timeline | Every blocking gate is `pass`, `fail` or an explicit human `waive` |
| 5. Brief | Compile one page that a non-specialist can repeat | All four validators pass; unknowns listed |

### Phase 1 — Interview

Variables the interviewer maintains in `ConstraintState`:

- team size, year mix, who does wet lab and who does dry lab;
- lab: BSL level, plate reader / fluorescence / flow / HPLC, strains, plasmids;
- budget, sponsorship, whether gene synthesis is reimbursable;
- when the lab opens, how many full weeks in summer;
- the real problem and who has it; the team's current workaround;
- the techniques the team wants to learn;
- hard no-go areas (pathogens, animal work, radioactivity, human samples);
- the school's or advisor's existing assets;
- two or three candidates; "if only one experiment can produce data, which one";
- "what would make this year feel worth it".

The interviewer asks the question with the highest expected information gain, not a
fixed list. Questions are multiple-choice with a recommended guess and an "Other"
escape hatch.

### Question bank (`v0.2`)

The runtime ships ten questions. Four are **blocking** and must be answered before
the idea can move to `verifying`:

- `lab.bsl` — BSL-1 / BSL-2 / BSL-3 / not sure;
- `lab.readers` — plate reader, HPLC, flow, or none;
- `time.summer_weeks` — how many full lab weeks;
- `success.metric` — the one number that decides success.

The other six are informative: `team.wet`, `budget.total`, `problem.who`,
`skill.want`, `nogo.pathogen`, `asset.school`. `nextQuestion` scores by entropy
discounted by the known confidence and gives blocking questions a 3× weight;
`latent ask` prints the next one. A blocking question is satisfied at
`confidence ≥ 0.6`; the default is `1.0` for a human answer.

### Phase 2 — Background

Four things, or keep searching:

1. **Scale**: how many people, tonnes, yuan, samples per year.
2. **Incumbent**: what is used now, who sells it, at what price.
3. **Bottleneck**: the one quantifiable metric where the incumbent fails (limit of
   detection, cost, time, cold chain, lab requirement).
4. **Biological advantage**: how much better on the same metric, as a multiple or
   an order of magnitude.

Banned without a number or a citation: "greener", "more sensitive", "more
accurate". Output is a **Gap table**: problem / incumbent / bottleneck value /
biological mechanism / target metric / source.

### Phase 3 — Components

Three lines in parallel:

- **iGEM history**: `competition.igem.org/results/<year>` → `teams.igem.org/<id>`;
  early wikis at `<year>.igem.org/Team:<team>`. Read the Engineering Success and
  Parts pages, not the promo video.
- **Registry**: `registry.igem.org` search and BLAST; batch FASTA at
  `parts.igem.org/fasta/parts/<BBa_ID>`; the whole library is about 30 MB at
  `parts.igem.org/fasta/parts/All_Parts`; XML/SQL dumps at
  `parts.igem.org/partsdb/download.cgi`.
- **Papers**: PubMed, Europe PMC, bioRxiv.

Evidence scale:

| Grade | Meaning | Budget implication |
|---|---|---|
| **A** | Peer-reviewed characterisation (dose response, kinetics, orthogonality) | Reuse, verify in host |
| **B** | iGEM wiki or Registry data only | Re-characterise before relying on it |
| **C** | Sequence only, no functional data | Budget as "build and characterise from scratch" |

Synthesis cost: about **USD 100 per 1 kb** at the low end; use a local quote.

Output: a component table (use / source / grade / works in your host / what to
change), split into **reuse**, **re-characterise**, **build**.

Collision has two forms: **the mechanism was done**, or **the interface was not**.
A mechanism collision alone is not a reason to kill; the novelty must be argued in
the interface or the quantification. Only a mechanism **and** interface collision
is a kill.

### Phase 4 — Feasibility

MVP: **one host, one readout, one decidable number.** Write the positive control,
negative control, replicates, threshold and weeks.

Every gate has four things: a **falsifier** (what you would see if you are wrong),
**controls** (negative, positive, specificity), **n and statistics**, and a
**failure action** (cut, switch, shrink).

Burden and orthogonality are mandatory, not a sentence:

- metabolic burden: growth rate, competition assay, or product/biomass ratio;
- non-orthogonality: substrate pool, cofactors, pH, regulatory network, secretion
  saturation, native isoenzymes;
- material balance first, then FBA (for example COBRApy with a genome-scale model);
- evolutionary stability: plasmid loss or inactivation without selection; use
  integration or passage limits.

Risk table: technical, biological, compliance (BSL/ethics/shipping), time. Each
row has a trigger and a fallback. Fallbacks are limited to four: change the
readout, change the host, reduce the scope, replace with computation.

### Phase 5 — Brief

One page, plain language, conclusion first, numbers with units, acronyms expanded,
risks not hidden. Template: [`../verticals/igem/brief.md`](../verticals/igem/brief.md).

## Gates

| # | Gate | If it fails |
|---|---|---|
| 1 | A measurable readout with a dose response | Kill |
| 2 | Host and operation at BSL-1, or the team has BSL-2 clearance | Change host |
| 3 | The core does not depend on unvalidated de novo protein design | Demote to backup |
| 4 | One DBTL loop closes in 6–8 weeks | Reduce scope |
| 5 | At least 2× better than the incumbent; for enabling tools, compare to "no one does this" and require an order-of-magnitude reduction in failure rate or labour | Change the problem |
| 6 | A real external stakeholder can be interviewed | Add Human Practices |
| 7 | Something shareable can be produced (part, protocol, software, hardware, data) | Add Contribution |

Gate 5 for enabling tools uses a different comparison. Comparing a tool to concrete
or epoxy kills real projects; compare it to the current absence of the workflow.

## 2026 anchors

- Projects are organised by **Village** (15): Bioremediation, Agriculture,
  Foundational Advance, Art & Design, Therapeutics, Space, Diagnostics,
  Biomanufacturing, Conservation, Food & Nutrition, Oncology, Infectious Diseases,
  Fashion & Cosmetics, Climate Crisis, Software & AI. Choose one primary and one
  backup, and submit a preliminary title and description at registration.
- **Bronze**: deliverables, attributions, contribution.
  **Silver**: engineering success (at least one DBTL loop) and human practices.
  **Gold**: three Special Awards, each meeting its rubric; from 2026 there is no
  separate Gold vote.
- **Special Awards** (17): Best Education, Entrepreneurship, Hardware, Inclusivity,
  Integrated Human Practices, Measurement, Model, New Basic Part, New Composite
  Part, New Improved Part, Part Collection, Alternative Platform, Presentation,
  Safety and Security, Software, Sustainable Development Impact, Wiki.
- Judges score 1–6 on engineering principles, standard parts, whether it was built,
  whether the data supports the conclusion, and impact.

## Biosafety

The pack does not own the biosafety screen. The shared reconstruction path runs
the classifier over the fragment and string constraints before any reconstructor
sees them, for every vertical; there is no `biosafety: true` flag to set or omit.
For iGEM this shows up in the work in two ways:

- Gate 2 (host and operation) uses the team's `lab.bsl` answer: a BSL-2 host needs
  BSL-2 clearance, and a direction that matches a select agent, toxin or
  enhancement term is refused before the interview proceeds.
- A refusal is a hard stop: CLI exit `1`, API `422 BIOSAFETY_BLOCKED` with
  `{category, bsl}`, and a content-free `biosafety.refused` event. A person can
  change the direction; nobody can switch the screen off (ADR 0020).

## Anti-patterns

- "Use synthetic biology to detect X" but no sampling site, buyer or price.
- Innovation only in the application; the mechanism is off the shelf.
- A host that cannot be cultured, or has no genetic tools.
- A readout that is "fluorescence goes up" with no dose response or dynamic range.
- A review that reads only the iGEM wiki, or only the papers.
- A season that needs three DBTL loops before any signal.

## Evaluation

The replay benchmark: for a historical year and Village, give the system only
pre-season information. Measure:

1. does the candidate set contain a viable topic?
2. is the collision report correct (mechanism vs interface)?
3. does the gate verdict agree with the actual DBTL outcome and an expert panel?
4. is the compiled brief complete and free of unsupported claims?

Start with 20 projects across at least five Villages. Grow only when the panel
agrees on the rubric.

## Mapping to the core

| iGEM phase | Core component | Primitive |
|---|---|---|
| Interview | Interviewer | `ConstraintState` |
| Background | Retrieval + ledger | `Claim` |
| Components | Novelty graph + retrieval | `Claim`, collision report |
| Feasibility | Gate engine | `Gate` |
| Brief | Compiler | `Brief` |

The vertical is a **pack**: variables, evidence scale, gates, compiler template and
corpus adapters. It contains no model-specific logic.

## Runtime modules

- [Components](../packages/vertical-igem/src/components.ts) — A/B/C to
  reuse/re-characterise/build, with weeks and cost.
- [Material and FBA](../packages/vertical-igem/src/material.ts) — reverse
  stoichiometry first, then an optional COBRApy sidecar
  ([cobra_fba.py](../packages/vertical-igem/python/cobra_fba.py)).
- [Timeline](../packages/vertical-igem/src/timeline.ts) — seeded Monte Carlo over
  tasks, dependencies and the term/summer calendar; `timelineGate` feeds gate 4.
- [Worked example](examples/igem-brief.md) — a full one-page brief with
  components, timeline, material balance and explicit unknowns.
