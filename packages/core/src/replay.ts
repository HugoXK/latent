import { assertValid, SchemaValidationError } from "./schema.js";
import type { ConstraintState } from "./constraints.js";
import type { Fragment, OutcomeDecision } from "./types.js";

export type ReplayVariant = "conservative" | "ambitious" | "cross_domain";
export type SourceGrade = "A" | "B" | "C";
export type GateExpectation = "pass" | "fail" | "unknown";

export interface ReplayMetadata {
  id: string;
  title: string;
  vertical: string;
  season: number;
  village: string;
  illustrative: boolean;
  temporal_cutoff: string;
  created_at: string;
  owner: string;
  license?: string | null;
}

export interface ReplayPriorArt {
  id: string;
  title: string;
  kind: "project" | "part" | "paper";
  year: number;
  url: string;
  published_at: string;
  mechanism: string;
  interface: string;
  source_grade: SourceGrade;
}

export interface ReplayCandidate {
  id: string;
  statement: string;
  variant: ReplayVariant;
  mechanism: string;
  interface: string;
  host: string;
  readout: string;
  is_seed: boolean;
}

export interface ReplayCollision {
  id: string;
  kind: "mechanism" | "interface" | "sequence";
  prior_art_id: string;
  note: string;
}

export interface ReplayGateLabel {
  gate: string;
  expected: GateExpectation;
  rationale: string;
  source?: string | null;
}

export interface ReplayOutcome {
  hidden: true;
  seed_title: string;
  seed_doi?: string | null;
  decision: OutcomeDecision;
  evidence: string[];
  notes?: string | null;
}

export interface ReplayCase {
  metadata: ReplayMetadata;
  constraints: ConstraintState;
  fragment: Fragment;
  prior_art: ReplayPriorArt[];
  expected_candidates: ReplayCandidate[];
  collisions: ReplayCollision[];
  gate_labels: ReplayGateLabel[];
  outcome: ReplayOutcome;
}

export interface ReplayIssue {
  code: string;
  path: string;
  message: string;
}

export class ReplayValidationError extends Error {
  readonly issues: ReplayIssue[];

  constructor(issues: ReplayIssue[]) {
    super(
      `replay case failed validation: ${issues
        .map((issue) => `${issue.code} at ${issue.path}`)
        .join("; ")}`,
    );
    this.name = "ReplayValidationError";
    this.issues = issues;
  }
}

/**
 * Validate a replay case against the canonical schema, then apply the
 * anti-leakage rules the schema cannot express:
 *
 * - every prior-art source predates the temporal cutoff;
 * - the hidden seed title and DOI do not appear in the input or prior art;
 * - exactly one candidate is marked as the seed;
 * - collision references and gate keys are consistent.
 */
export function validateReplayCase(value: unknown): ReplayIssue[] {
  try {
    assertValid("replayCase", value);
  } catch (error) {
    if (error instanceof SchemaValidationError) {
      return error.errors.map((issue) => ({
        code: "SCHEMA",
        path: issue.instancePath || "/",
        message: issue.message ?? "invalid",
      }));
    }
    throw error;
  }

  const replay = value as ReplayCase;
  const issues: ReplayIssue[] = [];
  const cutoff = Date.parse(replay.metadata.temporal_cutoff);

  for (const [index, source] of replay.prior_art.entries()) {
    const published = Date.parse(source.published_at);
    if (
      Number.isFinite(cutoff) &&
      Number.isFinite(published) &&
      published > cutoff
    ) {
      issues.push({
        code: "FUTURE_SOURCE",
        path: `/prior_art/${index}/published_at`,
        message: `published after the temporal cutoff ${replay.metadata.temporal_cutoff}`,
      });
    }
  }

  const seedTitle = replay.outcome.seed_title.trim().toLowerCase();
  const seedDoi = (replay.outcome.seed_doi ?? "").trim().toLowerCase();
  const input = `${replay.fragment.content}\n${JSON.stringify(
    replay.constraints,
  )}`.toLowerCase();

  if (seedTitle.length >= 8 && input.includes(seedTitle)) {
    issues.push({
      code: "SEED_LEAK",
      path: "/fragment/content",
      message: "the hidden seed title appears in the input",
    });
  }
  if (seedDoi.length >= 4 && input.includes(seedDoi)) {
    issues.push({
      code: "SEED_LEAK",
      path: "/fragment/content",
      message: "the hidden seed DOI appears in the input",
    });
  }

  for (const [index, source] of replay.prior_art.entries()) {
    const haystack = `${source.title} ${source.url}`.toLowerCase();
    if (seedTitle.length >= 8 && haystack.includes(seedTitle)) {
      issues.push({
        code: "SEED_IN_PRIOR_ART",
        path: `/prior_art/${index}/title`,
        message: "the hidden seed title appears in prior art",
      });
    }
    if (seedDoi.length >= 4 && haystack.includes(seedDoi)) {
      issues.push({
        code: "SEED_IN_PRIOR_ART",
        path: `/prior_art/${index}/url`,
        message: "the hidden seed DOI appears in prior art",
      });
    }
  }

  const seedCandidates = replay.expected_candidates.filter(
    (candidate) => candidate.is_seed,
  );
  if (seedCandidates.length !== 1) {
    issues.push({
      code: "SEED_CANDIDATE_COUNT",
      path: "/expected_candidates",
      message: `expected exactly one seed candidate, found ${seedCandidates.length}`,
    });
  }

  const priorIds = new Set<string>();
  for (const [index, source] of replay.prior_art.entries()) {
    if (priorIds.has(source.id)) {
      issues.push({
        code: "DUPLICATE_PRIOR_ART",
        path: `/prior_art/${index}/id`,
        message: `duplicate prior-art id ${source.id}`,
      });
    }
    priorIds.add(source.id);
  }

  for (const [index, collision] of replay.collisions.entries()) {
    if (!priorIds.has(collision.prior_art_id)) {
      issues.push({
        code: "UNKNOWN_PRIOR_ART",
        path: `/collisions/${index}/prior_art_id`,
        message: `unknown prior-art id ${collision.prior_art_id}`,
      });
    }
  }

  const gates = new Set<string>();
  for (const [index, gate] of replay.gate_labels.entries()) {
    if (gates.has(gate.gate)) {
      issues.push({
        code: "DUPLICATE_GATE",
        path: `/gate_labels/${index}/gate`,
        message: `duplicate gate ${gate.gate}`,
      });
    }
    gates.add(gate.gate);
  }

  return issues;
}

export function assertReplayCase(value: unknown): ReplayCase {
  const issues = validateReplayCase(value);
  if (issues.length > 0) {
    throw new ReplayValidationError(issues);
  }
  return value as ReplayCase;
}
