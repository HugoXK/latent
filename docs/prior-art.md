# Prior art

- Status: accepted
- Date: 2026-11-25
- Owner: HugoXK

This document records what already exists, what we borrow, and what we deliberately
do differently. It covers three bodies of work: the sibling projects in this
ecosystem, the external product landscape, and the academic record. It is a living
document; every new vertical or competitor gets a row.

## Method

We read the source of truth, not the marketing:

- README, ADRs, `AGENTS.md` and docs of the sibling repositories;
- product homepages and docs for external tools;
- abstracts and benchmarks for the academic claims.

A claim that we could not verify is marked **unverified** rather than asserted.

---

## Part I — Sibling projects

These are in the same account or the same working group. They are the closest
prior art because they share the design language: evidence-first, reviewable,
local-first, ports and adapters.

| Project | Thesis | What we borrow | What we do not copy |
|---|---|---|---|
| **Fledge** | Hosted repositories that grow themselves; one reviewable PR per job | Review-first delivery, risk tiers, ADRs, honest status, frozen paths, "defer" as an answer | GitHub/PR domain; we are not a code runner |
| **Janus** | Memory and foresight for market beliefs; point-in-time and calibrated | Point-in-time memory, claim/forecast ledger, calibration, "instrument not oracle" | Finance domain; no trading or price prediction |
| **AgentDescent** | Gradient descent where the parameters are agents | Offline evolution, parallel proposals, held-out gate, promotion ledger, canary/rollback | It is not an online runtime; it must never sit in the request path |
| **ScienceDiscovery** | A local research workspace with provenance and sandboxed execution | End-to-end provenance, literature connectors, sandbox, artifacts, local-first | We do not rebuild a research IDE; we call it as an adapter |
| **FlyBot** | Long-lived bot teams with memory, folders and schedules | Runtime for incubation and background agents; team memory; schedules | We do not build a general bot runtime; we use it as a port |
| **Bot Social** | Owner-governed sharing of assistants via MCP | Consent model for sharing an idea agent; per-grant scopes | We do not build a social network |
| **Bothouse** | Cross-platform team collaboration and memory | Team memory shape; plugin boundary | — |
| **OpenTeamily / LaunchPad** | Runtime containers and agent CI/infra | Deployment and CI patterns | — |

### Fledge (the closest reference)

Fledge is the clearest statement of the house style. It is a self-hosted platform
where a user connects a GitHub repository, gives it a goal, and a FlyBot agent
opens **one focused pull request** with a test. It never pushes to the default
branch, does not merge by default, and never executes the user's repository.

The transferable ideas:

1. **Optimise for the artifact, not the demo.** The unit is one reviewable PR, not
   a chat transcript. For Latent the unit is one **brief or spec**.
2. **Review at the tip.** A PASS is tied to the exact commit; a new commit voids
   it. For Latent: a verified claim is tied to a source snapshot and a version of
   the idea; new evidence can void it.
3. **Risk tiers from the diff, not from a label.** T0/T1 merge on green; T2/T3 need
   a human PASS. For Latent: scope/spend/safety changes are T2/T3 and require a
   human gate.
4. **Defer is a valid answer.** AgentDescent integration in Fledge promotes only
   with held-out evidence and human approval; insufficient data means `defer`.
   For Latent: an unverified idea is `defer`, not a confident claim.
5. **Frozen paths.** Authentication, the merge gate and CI config are frozen. For
   Latent: the ledger, the verifier and the gate engine are frozen; a candidate
   evolution cannot rewrite them.
6. **Honest status.** The README states the exact version and what is not shipped.
   We do the same.

What does not transfer: the GitHub/PR domain, the quota gateway, the OAuth
onboarding, and the code-execution boundary. Latent is not a code runner.

### Janus

Janus is a market agent with two faces: **memory** (what you believed, what you
knew, how it turned out) and **foresight** (calibrated probabilities about what
comes next). It is local-first, point-in-time, and explicitly "an instrument, not
an oracle".

The transferable ideas:

- **Point-in-time memory.** Every belief is stored with the time it was formed, so
  you cannot cheat by remembering the answer. Latent needs the same: a fragment,
  a hypothesis and a confidence are timestamped and versioned.
- **A ledger, not a chat.** Forecasts and outcomes are rows with provenance and a
  score. Latent's claim ledger is the same shape.
- **Calibration is a product feature.** A confidence without a calibration curve
  is decoration. Latent tracks predicted confidence against gate outcomes.
- **"Not an oracle."** The product must not pretend to certainty. This is the same
  ethical stance as "cite or abstain".

What does not transfer: markets, prices, trading, and the finance-specific
indicators.

### AgentDescent

AgentDescent evolves prompts, skills, agent directories, agent code and host
plugins against your own examples. *N* workers propose edits in parallel, one
aggregator merges them, and a held-out gate decides what is kept. It has a
promotion ledger, canaries and rollback.

The transferable ideas:

- **The system's own skills are artifacts.** The interviewer, the reconstruction
  prompts, the gate rubrics and the compiler templates can be evolved offline.
- **Held-out evaluation or it does not ship.** "It looked better" is not evidence.
- **Frozen safety paths.** The evaluator, the verifier and the promotion gate are
  never evolved by the loop.
- **Human approval and a canary.** The same rule as Fledge.

What does not transfer: it is a research reference implementation, not a runtime.
It must never sit on the request path of a user's idea.

### ScienceDiscovery

ScienceDiscovery is a local research workspace: an agent reads literature, writes
and runs code in a sandbox, and records the provenance of every result. It has
literature connectors, artifacts, a review panel and a CLI.

The transferable ideas:

- **End-to-end provenance.** Code, environment, logs and cited evidence are
  recorded per deliverable. Latent's brief should carry the same chain.
- **Sandboxed execution.** Cheap experiments belong in a sandbox, not in the
  user's repo.
- **Local-first with your own keys.** The same default as Latent.
- **The research vertical is an adapter, not a rewrite.** For scientific ideas,
  Latent calls ScienceDiscovery rather than reimplementing literature tooling.

### FlyBot

FlyBot is a local team of long-lived bots in the browser, on DeepSeek Harness. One
Chief splits a request across child bots; each keeps its own memory, folder, model
and schedules. It has projects, workflows, a task board and a social plugin.

The transferable ideas:

- **Long-lived agents with memory and schedules** are exactly what "incubation"
  needs. A background agent should wake on a schedule, connect a fragment to new
  evidence, and report back.
- **A team, not a single model.** The reconstruction can be a small team: a
  reconstructor, a domain critic, a red team, a compiler.
- **Plugins.** Verticals are plugins; the runtime stays general.

What does not transfer: the general chat/team product surface. Latent uses it as a
runtime port.

### Bot Social, Bothouse, OpenTeamily, LaunchPad

- **Bot Social** gives a consent model for sharing a bot: one grant, one bot,
  explicit approval, revocable. Latent can reuse this shape when a user wants to
  share an idea agent with a collaborator.
- **Bothouse** informs the team memory shape and the plugin boundary.
- **OpenTeamily / LaunchPad** inform deployment and CI; they are infrastructure,
  not product surface.

---

## Part II — External landscape

The market is crowded by layer, and empty at the seam.

| Layer | Representatives | What they solve | The gap Latent targets |
|---|---|---|---|
| **Capture** | Granola, Limitless/Rewind, AudioPen, Voicenotes, Otter, 飞书妙记, VoiceBrainDump, Scatternote, EchoLogue | Get the fragment out of your head with low friction | They store; they do not develop, verify or compile |
| **PKM / second brain** | Mem, Tana, Reflect, Heptabase, Obsidian+AI, Logseq, Reor, Khoj, Notion, Capacities, flomo, Recall | Structure, link and retrieve notes | Passive library; AI is a Q&A layer, not an incubator |
| **Research / deep agents** | ChatGPT/Perplexity/Gemini/Mistral Deep Research, Genspark, Manus, Flowith, Kimi, 秘塔, 元宝; open: Storm, GPT Researcher, Open Deep Research, Tongyi DeepResearch | Research a topic and write a report | Generic, no personal memory, no assumption ledger, homogenised |
| **Idea management** | Ideanote, Miro/FigJam AI, Whimsical, Mimosa, Kinopio | Collect, vote and manage ideas in a team | Process tooling; not personal depth; no evidence gates |
| **Idea → code** | Lovable, Bolt, v0, Replit Agent, Base44, Cursor, Claude Code, Codex | Turn a prompt into a prototype | Assumes the idea is already specified; ignores upstream ambiguity |
| **Science** | Elicit, Consensus, SciSpace, Undermind, FutureHouse, Google AI Co-Scientist, Sakana AI Scientist, Agent Laboratory, Virtual Lab | Literature, hypotheses, experiments | Vertical, expensive, not a personal idea loop |
| **Digital minds / journaling** | Delphi, Personal.ai, Mindsera, AI journals | A persistent persona or reflective practice | Persona, not evidence; no gates or specs |

### The seam

No product owns the full path:

```
fragment → reconstruction → incubation → verification → executable spec → outcome
```

Capture apps stop at the first arrow. PKM stops at storage. Deep research starts
from a topic, not a fragment, and ends at a report. Coding agents start from a
finished prompt. Science tools are domain-specific. **The seam is the product.**

### What each layer does better than us (and we should not rebuild)

- Capture: they have the distribution and the habit. Integrate or import.
- PKM: they have the graph and the editor. Import, don't compete.
- Deep research: they have the retrieval breadth. Call them as tools.
- Coding agents: they have the execution. Compile a spec for them.
- Science tools: they have the domain data. Adapter per vertical.

---

## Part III — Academic evidence

The design is constrained by what the literature actually shows.

| Finding | Source | Implication for Latent |
|---|---|---|
| LLM ideas are judged **more novel** than expert ideas, but **slightly weaker on feasibility** | Si et al., 2024, [2409.04109](https://arxiv.org/abs/2409.04109) | The product must add the feasibility half, not just generate |
| LLM product ideas can be higher quality on average (7× more likely in the top 10%), but are **less novel per idea and less diverse per set** | [2607.27553](https://arxiv.org/abs/2607.27553) | Enforce diversity structurally; do not sell volume |
| Recovering a true research idea from only its pre-publication bibliography: frontier models match **~3–15%** | [2608.16645](https://arxiv.org/abs/2608.16645) | Never promise precise reconstruction; show hypotheses and assumptions |
| A novel idea can be **under-specified for implementation**; codification readiness is a separate capability | [2609.10539](https://arxiv.org/abs/2609.10539) | The compiler is a first-class product, not an afterthought |
| Multi-agent ideation–critique–revision improves diversity; **critic diversity improves feasibility** | [2507.08350](https://arxiv.org/abs/2507.08350) | Build the reconstruction as a team with a red team |
| Benchmarking research idea generation needs a controlled context and a reference | [2411.02429](https://arxiv.org/abs/2411.02429) | Build a replay benchmark; do not rely on vibes |
| Organising literature as a **chain of ideas** improves ideation | [2410.13185](https://arxiv.org/abs/2410.13185) | The novelty graph is a chain, not a bag of embeddings |
| A reviewer model trained on real reviews can judge ideas | [2504.20090](https://arxiv.org/abs/2504.20090) | A verifier/judge is viable, but must be audited |
| Autonomous research assistants can complete the pipeline from a human idea | [2501.04227](https://arxiv.org/abs/2501.04227) | Latent stops at the spec; execution belongs to a runtime |
| A co-scientist can generate and rank hypotheses | [2502.18864](https://arxiv.org/abs/2502.18864) | Hypothesis ranking is a real feature, with human review |
| Creativity support tools should be judged on more than productivity | [2505.01601](https://arxiv.org/abs/2505.01601) | Measure reflection, calibration and decided outcomes, not tokens |
| Human–AI prewriting is a three-stage loop with the **human dominant** | [2307.10811](https://arxiv.org/abs/2307.10811) | Design for human authorship, not autonomy |
| Rapid ideation: LLMs give more variety, not necessarily higher quality | [2403.12928](https://arxiv.org/abs/2403.12928) | Variety is a means, not the goal |
| A creativity-centred survey of scientific ideation methods | [2511.07448](https://arxiv.org/abs/2511.07448) | Use the five families as a design checklist |
| Expert judges disagree substantially on business ideas | [2604.22517](https://arxiv.org/abs/2604.22517) | Use panels and pairwise comparisons, not a single score |

The uncomfortable conclusion: **generation is the easy part, and the least
defensible part.** The defensible parts are the ledger, the gates, the compiler,
the memory and the calibration.

---

## Part IV — Lessons

1. **Generation is commoditised.** Do not charge for text; charge for judgement and
   follow-through.
2. **Novelty is not value.** The gate is feasibility and evidence, not surprise.
3. **Diversity collapses.** Enforce it with structure, not with a prompt that says
   "be diverse".
4. **Reconstruction is hard.** Show multiple hypotheses and an assumption ledger;
   never present one answer as the truth.
5. **Under-specification is the real gap.** A brief that a coding agent cannot
   implement is not done.
6. **Evaluation is hard and human.** Panels, pairwise comparisons, replay
   benchmarks; no single judge.
7. **Provenance is the moat.** Anyone can generate; few can show their work.
8. **Human-in-the-loop is a feature.** The user must remain the author.
9. **The artifact is the unit.** One brief, one spec, one decision — not a chat.
10. **Plug into a runtime.** Do not rebuild execution, research or social; use
    ports and adapters.

---

## Part V — Positioning

```
                 develop (make it defensible)
                          ▲
                          │
        Latent ●          │
                          │        ● ScienceDiscovery (research IDE)
   personal ──────────────┼────────────────────── shared
                          │
        ● PKM / notes     │        ● Deep research / agents
                          │        ● Idea management
                          ▼
                    generate (make more text)
```

- **Top-right** is shared, research-grade tooling. Strong, but not personal and not
  about a fragment.
- **Bottom-right** is generation and research at scale. Crowded and commoditised.
- **Bottom-left** is storage. Necessary, but passive.
- **Top-left** — personal, developmental, evidence-backed — is where Latent sits.

The wedge is not "AI for ideas". It is **"the compiler from a fragment to a
defensible artifact"**, starting with the strictest small world we could find:
iGEM topic selection.

---

## Part VI — What we will not copy

- We will not become a note app, a chat app, a code runner or a social feed.
- We will not promise autonomous research or autonomous spending.
- We will not present a single reconstruction as the truth.
- We will not optimise for the number of ideas generated.
- We will not couple the core to one model, one runtime or one search vendor.
- We will not copy code, text, icons or graphics from the products above.

## References

Sibling repositories: [Fledge](https://github.com/HugoXK/fledge),
[Janus](https://github.com/HugoXK/janus),
[AgentDescent](https://github.com/ThinkFlowLab/agentdescent),
[ScienceDiscovery](https://github.com/HugoXK/sciencediscovery),
[FlyBot](https://github.com/ThinkFlowLab/FlyBot),
[Bot Social](https://github.com/HugoXK/bot-social).

Academic references are linked inline in Part III. Product names are used for
identification only and remain the property of their owners.
