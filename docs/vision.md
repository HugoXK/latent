# Vision

- Status: accepted
- Date: 2026-11-25
- Owner: HugoXK

## The problem

A good idea rarely arrives finished. It arrives as three keywords, a voice note at
midnight, a sketch on a napkin, or a sentence you cannot finish. The gap between
that fragment and something you can act on is where most ideas die — not because
the idea was bad, but because nobody developed it.

Four failure modes are common today:

1. **Passive storage.** Note apps keep the fragment forever and never develop it.
2. **Confident invention.** A chat model fills the gaps and hides that it did; the
   fluent version is indistinguishable from the sourced one.
3. **Premature execution.** An autonomous agent runs with an unapproved guess,
   spends money, or ships the wrong thing.
4. **Volume without judgement.** A generator produces twenty ideas, none of which
   is feasible, differentiated, or worth a week of work.

At the same time, implementation is getting cheaper. Coding agents, better models
and better harnesses compress the build. That does not make ideas less important;
it moves the bottleneck to **articulation, judgement and verification**. The
scarce skill is no longer "can you build it", it is "do you know what is worth
building, and can you prove it before you spend a year".

## The thesis

> The idea already exists. The job is to develop it, and to be honest about what
> was developed versus what was invented.

Latent is an **idea development platform**, not an idea generator. It takes a
fragment and produces:

- a small set of explicit reconstructions, not one confident answer;
- an assumption ledger listing every gap the system filled;
- a calibrated confidence for each claim;
- the next question with the highest expected information gain;
- a set of falsifiable gates with controls and fallbacks;
- a compiled brief or spec that a person, a coding agent or a research team can
  act on;
- a memory of what happened, so the next reconstruction is better.

The photographic metaphor is load-bearing. A latent image is already on the film;
the developer does not invent it, it makes it visible. The product's promise is
**development**, not creation. This is also the ethical position: the user remains
the author; the system is the darkroom.

## Why now

Three shifts make this possible and necessary:

1. **Cheap implementation.** The cost of turning a spec into a prototype keeps
   falling, so the value moves upstream to the spec and its evidence.
2. **Cheap retrieval and reasoning.** Models can now read a domain corpus, compare
   mechanisms, and surface contradictions — badly, but usefully, if constrained.
3. **Cheap generation has saturated.** Everyone can generate text. The differentiator
   is provenance, calibration and follow-through, which are engineering problems,
   not model problems.

The academic record is sobering and useful: LLM ideas are often judged more novel
but less feasible; they are less diverse at the set level; reconstructing a true
idea from fragments is still hard; and a novel idea can be too under-specified to
implement. Those are exactly the four problems Latent is built around. See
[prior-art.md](prior-art.md).

## The loop

```
Capture → Develop → Incubate → Verify → Compile → Learn
   ↑                                                  │
   └──────────── memory / calibration ────────────────┘
```

- **Capture** must be cheaper than forgetting.
- **Develop** must expose assumptions, not hide them.
- **Incubate** must be patient and proactive: the system resurfaces, the user does
  not have to remember.
- **Verify** must be falsifiable: every gate names what would prove it wrong.
- **Compile** must be honest: numbers with units, risks not hidden, unknowns
  listed.
- **Learn** must close the loop: predicted confidence versus real outcome.

## Principles

### 1. Cite or abstain

A claim without a source is `inferred` or `unknown`. A compiled brief with an
unsupported claim is a defect, not a style choice. The verifier checks whether the
cited span actually supports the claim, not merely that a URL exists.

### 2. Assumptions are first-class

Every reconstruction fills gaps. The system must list them, mark them as
assumptions, and let the user confirm, correct or delete each one. An assumption
that is load-bearing and unconfirmed blocks promotion.

### 3. Confidence is calibrated

The system records a confidence and later compares it to reality. A calibration
curve is a product feature. "Defer" is a valid, first-class answer.

### 4. Human decides

Models propose; humans approve anything that changes scope, spend, safety or
publication. Gates that would cross those lines are human-only.

### 5. Anti-homogenisation

LLM ideation collapses toward the average. Latent enforces diversity structurally:
multiple personas, cross-domain analogy, adversarial critique, and a diversity
check on the candidate set.

### 6. Local-first and private

Thoughts are sensitive. Default to local storage and the user's own model keys.
Encrypt at rest, redact logs, and make export a first-class feature. A hosted
version is optional.

### 7. Ports, not dependencies

Runtime, model, search, evolution and calibration are adapters behind ports. The
core must run without any single vendor, and must be able to plug into the sibling
projects without being coupled to them.

## Who it is for

| User | Job to be done | What success looks like |
|---|---|---|
| Independent builder | "I have a vague product idea; is it worth a month?" | A brief with demand evidence, a collision report, and one testable MVP |
| Product manager | "I have a direction; make it concrete and de-risked" | A spec with assumptions, gates and a red-team pass |
| Researcher / student | "I have a topic; is it novel, feasible, fundable?" | A proposal skeleton with citations and a feasibility verdict |
| Competition team (iGEM) | "We have a direction; pick a topic that finishes in one season" | A one-page brief that passes the vertical's gates |
| Investor / analyst | "Is this thesis differentiated and evidence-backed?" | A claim ledger with confidence and contradictions |

## Non-goals

- **Not a feed.** No infinite scroll of generated ideas.
- **Not an autonomous researcher.** No unsupervised publication or spend.
- **Not a note app.** Storage is necessary but not the product.
- **Not a code runner.** It compiles; a runtime executes.
- **Not a single-model wrapper.** The ledger and gates are the product.

## Success metrics

Leading indicators:

- capture frequency per active user per week;
- share of reconstructions accepted with at most one edit;
- share of assumptions confirmed versus refuted;
- time from fragment to a compiled brief;
- gate verdict agreement with an expert panel.

Lagging indicators:

- share of ideas that reach a decided state (shipped, tested, parked, killed);
- calibration error between predicted and realised confidence;
- four-week retention of capture and weekly development.

We explicitly do **not** optimise for number of ideas generated, tokens consumed,
or time spent in the app.

## Relationship to the ecosystem

Latent is the **idea layer** of a larger agent stack:

- **FlyBot** provides the long-lived agent runtime and team memory.
- **AgentDescent** provides offline evolution of prompts, skills and harnesses,
  with a held-out gate and a promotion ledger.
- **Janus** provides the point-in-time memory and calibration pattern.
- **ScienceDiscovery** provides research tools, sandboxed execution and
  literature connectors for the science verticals.
- **Bot Social** and **Bothouse** provide sharing and team collaboration when the
  user wants them.

The integration is by **port and adapter**, never a hard dependency. See
[decisions/0005-ecosystem.md](decisions/0005-ecosystem.md).

## Open questions

1. What is the minimum capture friction that still yields a usable fragment?
2. How much reconstruction can happen before the user feels the idea is no longer
   theirs?
3. Which vertical produces the strongest retention: iGEM, research proposals, or
   startup ideas?
4. Can calibration be learned from a single user's history, or does it need a
   population?
5. What is the right sharing model for ideas that are private by nature?
