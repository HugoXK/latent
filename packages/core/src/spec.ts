import { blockingGates } from "./gates.js";
import { newId } from "./ids.js";
import { blocksBrief, validateLedger } from "./ledger.js";
import type {
  AssumptionStatus,
  Claim,
  Gate,
  Idea,
  RiskLevel,
} from "./types.js";

export interface SpecAssumption {
  id: string;
  statement: string;
  risk: RiskLevel;
  status: AssumptionStatus;
}

export interface SpecInterface {
  name: string;
  contract: string;
  inputs: string[];
  outputs: string[];
}

export interface SpecDataContract {
  name: string;
  schema: string;
  notes?: string | null;
}

export interface SpecTest {
  name: string;
  given: string;
  when: string;
  then: string;
}

export interface SpecMilestone {
  name: string;
  weeks: number;
  exit_criteria: string;
}

export interface Spec {
  id: string;
  idea_id: string;
  idea_version: number;
  one_liner: string;
  assumptions: SpecAssumption[];
  interfaces: SpecInterface[];
  data_contracts: SpecDataContract[];
  tests: SpecTest[];
  milestones: SpecMilestone[];
  unknowns: string[];
  created_at: string;
}

export class SpecValidationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`Spec validation failed: ${issues.join("; ")}`);
    this.name = "SpecValidationError";
    this.issues = issues;
  }
}

export interface CompileSpecInput {
  idea: Idea;
  claims: Claim[];
  gates: Gate[];
  interfaces?: SpecInterface[];
  data_contracts?: SpecDataContract[];
  milestones?: SpecMilestone[];
  now?: string;
}

/**
 * The implementation-facing artifact. It is stricter than the brief: a spec
 * that a coding agent cannot implement is a defect, so unsupported claims,
 * unknown hard gates and open high-risk assumptions block it.
 */
export function compileSpec(input: CompileSpecInput): Spec {
  const issues: string[] = [];
  issues.push(
    ...validateLedger(input.claims).map(
      (issue) => `${issue.code}: ${issue.message}`,
    ),
  );
  const blockedClaims = input.claims.filter(blocksBrief);
  if (blockedClaims.length > 0) {
    issues.push(
      `UNSUPPORTED_CLAIMS: ${blockedClaims.map((claim) => claim.id).join(", ")}`,
    );
  }
  const blockedGates = blockingGates(input.gates);
  if (blockedGates.length > 0) {
    issues.push(
      `BLOCKING_GATES: ${blockedGates.map((gate) => gate.id).join(", ")}`,
    );
  }
  const blockingAssumptions = input.idea.assumptions.filter(
    (assumption) =>
      assumption.risk === "high" && assumption.status === "unconfirmed",
  );
  if (blockingAssumptions.length > 0) {
    issues.push(
      `BLOCKING_ASSUMPTIONS: ${blockingAssumptions
        .map((assumption) => assumption.id)
        .join(", ")}`,
    );
  }
  if (issues.length > 0) throw new SpecValidationError(issues);

  const tests: SpecTest[] = input.gates.map((gate) => ({
    name: gate.name,
    given: gate.criteria,
    when: "the implementation runs against the replay case",
    then: gate.falsifier,
  }));

  const unknowns = [
    ...input.claims
      .filter((claim) => claim.status === "unknown")
      .map((claim) => claim.text),
    ...(input.idea.open_questions ?? [])
      .filter((question) => question.answered !== true)
      .map((question) => question.question),
    ...input.idea.assumptions
      .filter((assumption) => assumption.status === "unconfirmed")
      .map((assumption) => assumption.statement),
  ];
  if (unknowns.length === 0) {
    unknowns.push("No explicit gaps recorded; review the spec.");
  }

  return {
    id: newId("spec"),
    idea_id: input.idea.id,
    idea_version: input.idea.version,
    one_liner: input.idea.one_liner,
    assumptions: input.idea.assumptions.map((assumption) => ({
      id: assumption.id,
      statement: assumption.statement,
      risk: assumption.risk,
      status: assumption.status,
    })),
    interfaces: input.interfaces ?? [],
    data_contracts: input.data_contracts ?? [],
    tests,
    milestones: input.milestones ?? [],
    unknowns,
    created_at: input.now ?? new Date().toISOString(),
  };
}

export function renderSpecMarkdown(spec: Spec): string {
  const assumptions =
    spec.assumptions.length > 0
      ? spec.assumptions
          .map(
            (assumption) =>
              `- [${assumption.status}/${assumption.risk}] ${assumption.statement}`,
          )
          .join("\n")
      : "- none";
  const interfaces =
    spec.interfaces.length > 0
      ? spec.interfaces
          .map(
            (entry) =>
              `- **${entry.name}**: ${entry.contract} (in: ${entry.inputs.join(", ") || "none"}; out: ${entry.outputs.join(", ") || "none"})`,
          )
          .join("\n")
      : "- none";
  const dataContracts =
    spec.data_contracts.length > 0
      ? spec.data_contracts
          .map(
            (contract) =>
              `- **${contract.name}**: ${contract.schema}${contract.notes ? ` (${contract.notes})` : ""}`,
          )
          .join("\n")
      : "- none";
  const tests =
    spec.tests.length > 0
      ? spec.tests
          .map(
            (test) =>
              `- **${test.name}**\n  - given: ${test.given}\n  - when: ${test.when}\n  - then: ${test.then}`,
          )
          .join("\n")
      : "- none";
  const milestones =
    spec.milestones.length > 0
      ? spec.milestones
          .map(
            (milestone) =>
              `- **${milestone.name}** (${milestone.weeks} weeks): ${milestone.exit_criteria}`,
          )
          .join("\n")
      : "- none";

  return [
    `# Spec: ${spec.one_liner}`,
    "",
    `> idea ${spec.idea_id} · v${spec.idea_version} · spec ${spec.id}`,
    "",
    "## Assumptions",
    "",
    assumptions,
    "",
    "## Interfaces",
    "",
    interfaces,
    "",
    "## Data contracts",
    "",
    dataContracts,
    "",
    "## Tests",
    "",
    tests,
    "",
    "## Milestones",
    "",
    milestones,
    "",
    "## Still unknown",
    "",
    spec.unknowns.map((unknown) => `- ${unknown}`).join("\n"),
    "",
  ].join("\n");
}
