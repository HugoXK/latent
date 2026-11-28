import { newId } from "./ids.js";
import { blockingGates } from "./gates.js";
import { blocksBrief, validateLedger } from "./ledger.js";
import type {
  Brief,
  BriefCollision,
  BriefExtraSection,
  BriefRisk,
  BriefValidator,
  BriefValidatorName,
  Claim,
  Gate,
  Idea,
} from "./types.js";

export class BriefValidationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`Brief validation failed: ${issues.join("; ")}`);
    this.name = "BriefValidationError";
    this.issues = issues;
  }
}

export interface CompileInput {
  idea: Idea;
  claims: Claim[];
  gates: Gate[];
  unknowns?: string[];
  now?: string;
  /**
   * Optional results from vertical-specific checks. When a check is not
   * supplied it is recorded as `skipped`, never as `pass`.
   */
  validators?: Partial<Record<BriefValidatorName, BriefValidator>>;
  collisions?: BriefCollision[];
  sections?: BriefExtraSection[];
  extraRisks?: BriefRisk[];
}

export function compileBrief(input: CompileInput): Brief {
  const issues: string[] = [];
  const ledgerIssues = validateLedger(input.claims);

  issues.push(...ledgerIssues.map((i) => `${i.code}: ${i.message}`));

  const blockedClaims = input.claims.filter(blocksBrief);
  if (blockedClaims.length > 0) {
    issues.push(`UNSUPPORTED_CLAIMS: ${blockedClaims.map((c) => c.id).join(", ")}`);
  }

  const blockedGates = blockingGates(input.gates);
  if (blockedGates.length > 0) {
    issues.push(`BLOCKING_GATES: ${blockedGates.map((g) => g.id).join(", ")}`);
  }

  const blockingAssumptions = input.idea.assumptions.filter(
    (a) => a.risk === "high" && a.status === "unconfirmed",
  );
  if (blockingAssumptions.length > 0) {
    issues.push(
      `BLOCKING_ASSUMPTIONS: ${blockingAssumptions.map((a) => a.id).join(", ")}`,
    );
  }

  if (issues.length > 0) {
    throw new BriefValidationError(issues);
  }

  const evidence = input.claims
    .filter((c) => c.status === "verified" || c.status === "inferred")
    .map((c) => c.id);

  const risks: BriefRisk[] = [];
  for (const gate of input.gates) {
    if (gate.status === "fail" || gate.status === "unknown") {
      risks.push({
        risk: `${gate.name} is ${gate.status}`,
        trigger: gate.falsifier,
        fallback: gate.fallback,
      });
    }
  }
  for (const claim of input.claims) {
    if (claim.status === "contradicted") {
      risks.push({
        risk: `Contradicted claim: ${claim.text}`,
        trigger: "A source contradicts this claim",
        fallback: "reduce_scope",
      });
    }
  }
  risks.push(...(input.extraRisks ?? []));

  const unknowns = [
    ...(input.unknowns ?? []),
    ...input.claims
      .filter((c) => c.status === "unknown")
      .map((c) => c.text),
    ...(input.idea.open_questions ?? [])
      .filter((q) => q.answered !== true)
      .map((q) => q.question),
  ];
  if (unknowns.length === 0) {
    unknowns.push(
      "No explicit gaps recorded; this is suspicious and must be reviewed.",
    );
  }

  const nextSteps = (input.idea.open_questions ?? [])
    .filter((q) => q.answered !== true)
    .map((q) => q.question)
    .slice(0, 3);
  if (nextSteps.length === 0) {
    nextSteps.push("Confirm the next blocking assumption.");
  }

  const now = input.now ?? new Date().toISOString();

  const citationCodes = new Set([
    "UNSUPPORTED_VERIFIED",
    "C_CANNOT_BE_VERIFIED",
    "CONTRADICTION_WITHOUT_SOURCE",
  ]);
  const numericCodes = new Set([
    "NUMERIC_WITHOUT_UNIT",
    "CONFIDENCE_OUT_OF_RANGE",
  ]);
  const citationIssues = ledgerIssues.filter((i) => citationCodes.has(i.code));
  const numericIssues = ledgerIssues.filter((i) => numericCodes.has(i.code));

  const validators: BriefValidator[] = [
    {
      name: "citation",
      status: citationIssues.length === 0 ? "pass" : "fail",
      detail:
        citationIssues.length === 0
          ? null
          : `${citationIssues.length} citation issue(s)`,
    },
    {
      name: "numeric",
      status: numericIssues.length === 0 ? "pass" : "fail",
      detail:
        numericIssues.length === 0
          ? null
          : `${numericIssues.length} numeric issue(s)`,
    },
    input.validators?.existence ?? {
      name: "existence",
      status: "skipped",
      detail: "not implemented in v0.2",
    },
    input.validators?.vertical_rules ?? {
      name: "vertical_rules",
      status: "skipped",
      detail: "not implemented in v0.2",
    },
  ];

  return {
    id: newId("brf"),
    idea_id: input.idea.id,
    idea_version: input.idea.version,
    format: "markdown",
    one_liner: input.idea.one_liner,
    problem: { text: input.idea.one_liner, claim_ids: evidence },
    approach: {
      text: input.idea.hypotheses
        .map((h) => `- [${h.variant}] ${h.statement}`)
        .join("\n"),
      claim_ids: evidence,
    },
    evidence,
    risks,
    collisions: input.collisions ?? [],
    sections: input.sections ?? [],
    next_steps: nextSteps,
    unknowns,
    compiled_at: now,
    validators,
    schema_version: "1.0.0",
  };
}

export function renderBriefMarkdown(brief: Brief): string {
  const risks =
    brief.risks.length > 0
      ? brief.risks
          .map((r) => `| ${r.risk} | ${r.trigger} | ${r.fallback} |`)
          .join("\n")
      : "| — | — | — |";

  const evidence =
    brief.evidence.length > 0
      ? brief.evidence.map((id) => `- ${id}`).join("\n")
      : "- none yet";

  return [
    `# ${brief.one_liner}`,
    "",
    `> idea ${brief.idea_id} · v${brief.idea_version} · compiled ${brief.compiled_at ?? "unknown"}`,
    "",
    "## Problem",
    "",
    brief.problem.text,
    "",
    "## Approach",
    "",
    brief.approach.text,
    "",
    ...(brief.sections ?? []).flatMap((section) => [
      `## ${section.title}`,
      "",
      section.text,
      "",
    ]),
    "## Evidence",
    "",
    evidence,
    "",
    "## Risks",
    "",
    "| Risk | Trigger | Fallback |",
    "|---|---|---|",
    risks,
    "",
    ...(brief.collisions && brief.collisions.length > 0
      ? [
          "## Novelty and collisions",
          "",
          "| Kind | Prior | Severity | Note |",
          "|---|---|---|---|",
          ...brief.collisions.map(
            (collision) =>
              `| ${collision.kind} | ${collision.prior_label} | ${collision.severity} | ${collision.note} |`,
          ),
          "",
        ]
      : []),
    "## Next steps",
    "",
    brief.next_steps.map((s, i) => `${i + 1}. ${s}`).join("\n"),
    "",
    "## Still unknown",
    "",
    brief.unknowns.map((u) => `- ${u}`).join("\n"),
    "",
    `Validators: ${brief.validators.map((v) => `${v.name}=${v.status}`).join(", ")}`,
    "",
  ].join("\n");
}
