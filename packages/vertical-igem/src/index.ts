import type { VerticalPack } from "@latent/core";

export const igem: VerticalPack = {
  id: "igem",
  name: "iGEM topic selection",
  biosafety: true,
  variables: [
    "team.size",
    "team.years",
    "team.wet",
    "team.dry",
    "lab.bsl",
    "lab.readers",
    "lab.equipment",
    "lab.flow_model",
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
    "success.metric",
    "success.definition",
  ],
  questions: [
    {
      id: "q.lab.bsl",
      variable: "lab.bsl",
      prompt: "What BSL level can the team work at?",
      blocking: true,
      options: [
        { value: 1, label: "BSL-1 only", prior: 0.5 },
        { value: 2, label: "BSL-2 cleared", prior: 0.35 },
        { value: 3, label: "BSL-3", prior: 0.05 },
        { value: "unknown", label: "Not sure yet", prior: 0.1 },
      ],
    },
    {
      id: "q.lab.readers",
      variable: "lab.readers",
      prompt: "Which quantitative readout instrument can the team use?",
      blocking: true,
      options: [
        { value: "plate_reader", label: "Plate reader / fluorescence", prior: 0.45 },
        { value: "hplc", label: "HPLC", prior: 0.15 },
        { value: "flow", label: "Flow cytometry", prior: 0.15 },
        { value: "none", label: "None of these", prior: 0.25 },
      ],
    },
    {
      id: "q.lab.equipment",
      variable: "lab.equipment",
      prompt: "Which equipment can the team reserve for the season?",
      kind: "multi",
      options: [
        { value: "plate_reader", label: "Plate reader", prior: 0.4 },
        { value: "hplc", label: "HPLC", prior: 0.15 },
        { value: "flow", label: "Flow cytometer", prior: 0.15 },
        { value: "incubator", label: "Shaking incubator", prior: 0.2 },
        { value: "centrifuge", label: "Centrifuge", prior: 0.1 },
      ],
    },
    {
      id: "q.lab.flow_model",
      variable: "lab.flow_model",
      prompt: "Which flow-cytometry model can the team use?",
      dependsOn: [{ variable: "lab.readers", equals: "flow" }],
      options: [
        { value: "attractant", label: "Attractant / repellent assay", prior: 0.4 },
        { value: "reporter", label: "Reporter fluorescence", prior: 0.4 },
        { value: "both", label: "Both", prior: 0.2 },
      ],
    },
    {
      id: "q.time.summer_weeks",
      variable: "time.summer_weeks",
      prompt: "How many full weeks can the team work in the lab over the summer?",
      blocking: true,
      options: [
        { value: 2, label: "Fewer than 4 weeks", prior: 0.15 },
        { value: 4, label: "4–6 weeks", prior: 0.3 },
        { value: 6, label: "6–8 weeks", prior: 0.35 },
        { value: 10, label: "More than 8 weeks", prior: 0.2 },
      ],
    },
    {
      id: "q.success.metric",
      variable: "success.metric",
      prompt: "Which one number should decide whether the project succeeded?",
      blocking: true,
      options: [
        { value: "detection_limit", label: "Limit of detection", prior: 0.3 },
        { value: "cost", label: "Cost per sample", prior: 0.2 },
        { value: "time", label: "Time to result", prior: 0.2 },
        { value: "field", label: "Field deployability", prior: 0.3 },
      ],
    },
    {
      id: "q.team.wet",
      variable: "team.wet",
      prompt: "How many people can do wet-lab work?",
      options: [
        { value: 1, label: "1–2", prior: 0.3 },
        { value: 3, label: "3–5", prior: 0.45 },
        { value: 6, label: "6 or more", prior: 0.25 },
      ],
    },
    {
      id: "q.budget.total",
      variable: "budget.total",
      prompt: "What is the rough project budget, in USD?",
      options: [
        { value: 3000, label: "Under 5k", prior: 0.2 },
        { value: 10000, label: "5k–20k", prior: 0.35 },
        { value: 30000, label: "20k–50k", prior: 0.3 },
        { value: 80000, label: "Over 50k", prior: 0.15 },
      ],
    },
    {
      id: "q.problem.who",
      variable: "problem.who",
      prompt: "Who has the problem today?",
      allowOther: true,
      options: [
        { value: "patients", label: "Patients / clinicians", prior: 0.25 },
        { value: "industry", label: "Industry", prior: 0.2 },
        { value: "researchers", label: "Researchers", prior: 0.2 },
        { value: "agency", label: "Agency / government", prior: 0.2 },
        { value: "other", label: "Someone else", prior: 0.15 },
      ],
    },
    {
      id: "q.skill.want",
      variable: "skill.want",
      prompt: "Which technique does the team most want to learn?",
      options: [
        { value: "protein", label: "Protein engineering", prior: 0.2 },
        { value: "pathway", label: "Metabolic pathway", prior: 0.2 },
        { value: "cell_free", label: "Cell-free", prior: 0.15 },
        { value: "rna", label: "RNA", prior: 0.15 },
        { value: "microbiome", label: "Microbiome", prior: 0.15 },
        { value: "software", label: "Software / modelling", prior: 0.15 },
      ],
    },
    {
      id: "q.nogo.pathogen",
      variable: "nogo.pathogen",
      prompt: "Is working with pathogens a hard no-go?",
      options: [
        { value: true, label: "Yes, no pathogens", prior: 0.7 },
        { value: false, label: "No, it is allowed", prior: 0.3 },
      ],
    },
    {
      id: "q.asset.school",
      variable: "asset.school",
      prompt: "Does the school or advisor already have a relevant strain, enzyme or sample channel?",
      options: [
        { value: true, label: "Yes", prior: 0.45 },
        { value: false, label: "No / not sure", prior: 0.55 },
      ],
    },
    {
      id: "q.candidate.a",
      variable: "candidate.a",
      prompt: "Describe the candidate project in one or two sentences.",
      kind: "text",
      options: [],
    },
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

export * from "./rules.js";
export * from "./components.js";
export * from "./material.js";
export * from "./timeline.js";
export * from "./brief.js";
