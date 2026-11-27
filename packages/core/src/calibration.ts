import { newId } from "./ids.js";
import { createEdge } from "./memory.js";
import type {
  MemoryEdge,
  Outcome,
  OutcomeDecider,
  OutcomeDecision,
} from "./types.js";

/** The realised result vocabulary. A new decision kind is a schema change. */
export const OUTCOME_DECISIONS: readonly OutcomeDecision[] = [
  "shipped",
  "tested",
  "parked",
  "killed",
  "failed",
];

export const OUTCOME_DECIDERS: readonly OutcomeDecider[] = ["human", "expert"];

export class OutcomeError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "OutcomeError";
    this.code = code;
  }
}

export interface CreateOutcomeInput {
  id?: string;
  idea_id: string;
  idea_version: number;
  owner_id: string;
  decision: OutcomeDecision;
  realised_success: boolean;
  predicted_confidence: number;
  predicted_at?: string | null;
  decided_at?: string;
  decided_by?: OutcomeDecider;
  evidence?: string[];
  notes?: string | null;
}

/**
 * Record a realised outcome with the confidence snapshot taken before it was
 * known. The record is immutable; a correction is a new outcome.
 */
export function createOutcome(
  input: CreateOutcomeInput,
  now = new Date().toISOString(),
): Outcome {
  const owner = input.owner_id.trim();
  if (owner === "") {
    throw new OutcomeError("OWNER_REQUIRED", "An outcome needs an owner_id.");
  }
  if (input.idea_id.trim() === "") {
    throw new OutcomeError("IDEA_REQUIRED", "An outcome needs an idea_id.");
  }
  if (!Number.isInteger(input.idea_version) || input.idea_version < 1) {
    throw new OutcomeError(
      "INVALID_IDEA_VERSION",
      "idea_version must be an integer >= 1.",
    );
  }
  if (!OUTCOME_DECISIONS.includes(input.decision)) {
    throw new OutcomeError(
      "UNKNOWN_DECISION",
      `Unknown outcome decision: ${String(input.decision)}`,
    );
  }
  if (typeof input.realised_success !== "boolean") {
    throw new OutcomeError(
      "SUCCESS_REQUIRED",
      "realised_success must be recorded explicitly, not inferred.",
    );
  }
  const confidence = input.predicted_confidence;
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new OutcomeError(
      "CONFIDENCE_OUT_OF_RANGE",
      "predicted_confidence must be a finite number between 0 and 1.",
    );
  }
  const decidedBy = input.decided_by ?? "human";
  if (!OUTCOME_DECIDERS.includes(decidedBy)) {
    throw new OutcomeError(
      "UNKNOWN_DECIDER",
      `Unknown outcome decider: ${String(decidedBy)}`,
    );
  }

  return {
    id: input.id ?? newId("outcome"),
    idea_id: input.idea_id,
    idea_version: input.idea_version,
    owner_id: owner,
    decision: input.decision,
    realised_success: input.realised_success,
    predicted_confidence: confidence,
    predicted_at: input.predicted_at ?? null,
    decided_at: input.decided_at ?? now,
    decided_by: decidedBy,
    evidence: input.evidence ?? [],
    notes: input.notes ?? null,
    created_at: now,
    schema_version: "1.0.0",
  };
}

function sortedOutcomes(outcomes: readonly Outcome[]): Outcome[] {
  return [...outcomes].sort((a, b) => a.id.localeCompare(b.id));
}

/** Mean squared error between the predicted confidence and the realised 0/1. */
export function brierScore(outcomes: readonly Outcome[]): number | null {
  if (outcomes.length === 0) return null;
  const rows = sortedOutcomes(outcomes);
  const total = rows.reduce((sum, outcome) => {
    const actual = outcome.realised_success ? 1 : 0;
    const delta = outcome.predicted_confidence - actual;
    return sum + delta * delta;
  }, 0);
  return total / rows.length;
}

/** Negative log likelihood with a clamp so a confident miss stays finite. */
export function logLoss(outcomes: readonly Outcome[]): number | null {
  if (outcomes.length === 0) return null;
  const epsilon = 1e-12;
  const rows = sortedOutcomes(outcomes);
  const total = rows.reduce((sum, outcome) => {
    const p = Math.min(1 - epsilon, Math.max(epsilon, outcome.predicted_confidence));
    const y = outcome.realised_success ? 1 : 0;
    return sum - (y * Math.log(p) + (1 - y) * Math.log(1 - p));
  }, 0);
  return total / rows.length;
}

export interface CalibrationBin {
  lower: number;
  upper: number;
  count: number;
  mean_prediction: number | null;
  observed_success_rate: number | null;
}

export interface CalibrationReport {
  generated_at: string;
  sample_count: number;
  brier: number | null;
  log_loss: number | null;
  bins: CalibrationBin[];
  missing_outcome_ideas: string[];
}

/**
 * A reproducible calibration report. Outcomes are sorted by id before scoring,
 * the clock is injected, and decided ideas without an outcome are listed rather
 * than assumed to be failures.
 */
export function calibrationReport(
  outcomes: readonly Outcome[],
  options: { now?: string; decidedIdeaIds?: readonly string[] } = {},
): CalibrationReport {
  const rows = sortedOutcomes(outcomes);
  const bins = Array.from({ length: 10 }, (_, index) => ({
    lower: index / 10,
    upper: (index + 1) / 10,
    count: 0,
    predictionSum: 0,
    successes: 0,
  }));

  for (const outcome of rows) {
    const index = Math.min(
      9,
      Math.max(0, Math.floor(outcome.predicted_confidence * 10)),
    );
    const bin = bins[index];
    if (!bin) continue;
    bin.count += 1;
    bin.predictionSum += outcome.predicted_confidence;
    if (outcome.realised_success) bin.successes += 1;
  }

  const haveOutcome = new Set(rows.map((outcome) => outcome.idea_id));
  const missing = [...new Set(options.decidedIdeaIds ?? [])]
    .filter((ideaId) => !haveOutcome.has(ideaId))
    .sort();

  return {
    generated_at: options.now ?? new Date().toISOString(),
    sample_count: rows.length,
    brier: brierScore(rows),
    log_loss: logLoss(rows),
    bins: bins.map((bin) => ({
      lower: bin.lower,
      upper: bin.upper,
      count: bin.count,
      mean_prediction:
        bin.count > 0 ? bin.predictionSum / bin.count : null,
      observed_success_rate:
        bin.count > 0 ? bin.successes / bin.count : null,
    })),
    missing_outcome_ideas: missing,
  };
}

/** Every outcome belongs to exactly one idea; the edge is the audit link. */
export function outcomeEdge(outcome: Outcome, now = outcome.created_at): MemoryEdge {
  return createEdge(
    {
      owner_id: outcome.owner_id,
      from: { type: "outcome", id: outcome.id },
      to: { type: "idea", id: outcome.idea_id },
      relation: "outcome_of",
      provenance: "outcome",
    },
    now,
  );
}
