import {
  BiosafetyError,
  RuleBasedBiosafetyClassifier,
  checkBiosafety,
} from "./biosafety.js";
import type { BiosafetyClassifier } from "./biosafety.js";
import { createConstraintState } from "./constraints.js";
import type { ConstraintState } from "./constraints.js";
import { newId } from "./ids.js";
import type { Reconstructor } from "./ports.js";
import type { Claim, Fragment, Gate, Idea } from "./types.js";
import type { VerticalPack } from "./vertical.js";

export interface DevelopResult {
  idea: Idea;
  claims: Claim[];
  gates: Gate[];
  constraint: ConstraintState;
}

export interface DevelopInput {
  fragment: Fragment;
  vertical: VerticalPack;
  reconstructor: Reconstructor;
  constraint?: ConstraintState;
  classifier?: BiosafetyClassifier;
  /** The team's declared BSL level; defaults to the constraint answer, then 1. */
  team_bsl?: number;
  now?: string;
}

export async function develop(input: DevelopInput): Promise<DevelopResult> {
  const now = input.now ?? new Date().toISOString();
  const constraint =
    input.constraint ??
    createConstraintState(input.vertical.id, input.vertical.questions, now);

  // Pack-independent: every reconstruction passes the same screen. Opting a
  // pack out would be a bypass (the research pack is selectable); an opt-out
  // would need an ADR, owner approval and an audit trail.
  const text = [
    input.fragment.content,
    ...Object.values(constraint.variables)
      .map((variable) => variable.value)
      .filter((value): value is string => typeof value === "string"),
  ].join("\n");
  const answeredBsl = constraint.variables["lab.bsl"]?.value;
  const teamBsl =
    input.team_bsl ??
    (typeof answeredBsl === "number" ? answeredBsl : 1);
  const result = checkBiosafety({
    text,
    team_bsl: teamBsl,
    classifier: input.classifier ?? new RuleBasedBiosafetyClassifier(),
  });
  if (!result.pass) throw new BiosafetyError(result.verdict);

  const output = await input.reconstructor.reconstruct({
    fragment: input.fragment,
    verticalId: input.vertical.id,
    constraints: constraint,
    now,
  });

  const ideaId = newId("idea");

  const assumptions = output.assumptions.map((a, i) => ({
    id: `asm_${i + 1}`,
    statement: a.statement,
    status: "unconfirmed" as const,
    risk: a.risk,
  }));

  const claims: Claim[] = output.claims.map((c) => ({
    id: newId("clm"),
    text: c.text,
    status: c.status,
    confidence: c.confidence,
    confidence_basis: c.confidence_basis,
    sources: [],
    schema_version: "1.0.0",
  }));

  const hypotheses = output.hypotheses.map((h, i) => ({
    id: `hyp_${i + 1}`,
    variant: h.variant,
    statement: h.statement,
    confidence: h.confidence,
    confidence_basis: h.confidence_basis,
    assumption_ids: h.assumption_ids ?? assumptions.map((a) => a.id),
    claim_ids: [] as string[],
  }));

  const openQuestions = output.open_questions.map((q, i) => ({
    id: `q_${i + 1}`,
    question: q.question,
    expected_information_gain: q.expected_information_gain,
    variable: q.variable ?? null,
    answered: false,
  }));

  const gates: Gate[] = input.vertical.gates.map((g) => ({
    id: newId("gate"),
    idea_id: ideaId,
    name: g.name,
    status: "unknown",
    criteria: g.criteria,
    falsifier: g.falsifier,
    controls: [],
    evidence: [],
    fallback: g.fallback,
    hard: g.hard,
    decided_by: "rule",
    reason: null,
    decided_at: null,
    schema_version: "1.0.0",
  }));

  const idea: Idea = {
    id: ideaId,
    version: 1,
    fragment_ids: [input.fragment.id],
    vertical: input.vertical.id,
    title: output.title,
    one_liner: output.one_liner,
    status: "developed",
    hypotheses,
    assumptions,
    claims: claims.map((c) => c.id),
    open_questions: openQuestions,
    gate_ids: gates.map((g) => g.id),
    brief_ref: null,
    created_at: now,
    updated_at: now,
    schema_version: "1.0.0",
  };

  return { idea, claims, gates, constraint };
}
