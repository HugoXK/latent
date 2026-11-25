import type { VerticalPack } from "@latent/core";

export const igem: VerticalPack = {
  id: "igem",
  name: "iGEM topic selection",
  variables: [
    "team.size",
    "team.years",
    "team.wet",
    "team.dry",
    "lab.bsl",
    "lab.readers",
    "lab.flow",
    "lab.hplc",
    "lab.strains",
    "lab.plasmids",
    "lab.synthesis_reimbursed",
    "budget.total",
    "budget.sponsor",
    "time.lab_open",
    "time.summer_weeks",
    "problem.who",
    "problem.cost",
    "problem.workaround",
    "skill.want",
    "nogo.pathogen",
    "nogo.animal",
    "nogo.radio",
    "nogo.human_samples",
    "asset.school",
    "asset.advisor",
    "asset.clinic",
    "candidate.a",
    "candidate.b",
    "candidate.c",
    "success.definition",
  ],
  gates: [
    {
      key: "readout",
      name: "measurable readout",
      criteria:
        "A readout with a dose response, a dynamic range and a decidable threshold.",
      falsifier:
        "No response above 2× background across at least 8 concentrations.",
      fallback: "change_readout",
      hard: true,
    },
    {
      key: "bsl",
      name: "host and BSL",
      criteria:
        "The host and operations are BSL-1, or the team holds BSL-2 clearance.",
      falsifier:
        "The host or a required operation needs BSL-2 and the team has no clearance.",
      fallback: "change_host",
      hard: true,
    },
    {
      key: "design",
      name: "no unvalidated de novo design",
      criteria:
        "The core does not depend on a protein design with no experimental validation.",
      falsifier:
        "The only path to the readout is a de novo design with no characterisation.",
      fallback: "reduce_scope",
      hard: true,
    },
    {
      key: "dbtl",
      name: "one DBTL loop in season",
      criteria: "One Design–Build–Test–Learn loop can close in 6–8 weeks.",
      falsifier:
        "The earliest interpretable signal needs more than one full loop or more than 8 lab weeks.",
      fallback: "reduce_scope",
      hard: true,
    },
    {
      key: "advantage",
      name: "2× or an order of magnitude",
      criteria:
        "At least 2× better than the incumbent on one metric; for an enabling tool, an order-of-magnitude reduction in failure rate or labour.",
      falsifier:
        "On the chosen metric the expected improvement is below 2× (or below one order of magnitude for a tool).",
      fallback: "reduce_scope",
      hard: true,
    },
    {
      key: "stakeholder",
      name: "real external stakeholder",
      criteria:
        "A real external stakeholder can be interviewed and has a stake in the outcome.",
      falsifier: "No named stakeholder can be reached during the season.",
      fallback: "none",
      hard: false,
    },
    {
      key: "contribution",
      name: "shareable contribution",
      criteria:
        "The project can produce something shareable: a part, protocol, software, hardware or dataset.",
      falsifier: "Nothing reusable can be produced by the end of the season.",
      fallback: "reduce_scope",
      hard: false,
    },
  ],
  briefTemplate: "verticals/igem/brief.md",
};
