import { develop } from "./develop.js";
import { blocksBrief } from "./ledger.js";
import type { Reconstructor } from "./ports.js";
import type {
  ReplayCase,
  ReplayCollision,
  ReplayMetadata,
  ReplayPriorArt,
} from "./replay.js";
import type { Claim, Idea } from "./types.js";
import type { VerticalPack } from "./vertical.js";

export type ReplayGateVerdict = "pass" | "fail" | "unknown";

/**
 * The public view of a replay case. Hidden scoring fields (`expected_candidates`,
 * `collisions`, `gate_labels`, `outcome`) are deliberately absent: a plugin that
 * received them could echo the answer key and score 1.0 without doing the work.
 */
export interface ReplayPublicCase {
  metadata: ReplayMetadata;
  constraints: ReplayCase["constraints"];
  fragment: ReplayCase["fragment"];
  prior_art: ReplayPriorArt[];
}

export function replayPublicCase(replay: ReplayCase): ReplayPublicCase {
  return {
    metadata: replay.metadata,
    constraints: replay.constraints,
    fragment: replay.fragment,
    prior_art: replay.prior_art,
  };
}

export interface ReplayGatePredictor {
  predict(input: {
    case: ReplayPublicCase;
    idea: Idea;
    claims: Claim[];
  }): Promise<Record<string, ReplayGateVerdict>>;
}

export interface ReplayCollisionDetector {
  detect(input: { case: ReplayPublicCase; idea: Idea }): Promise<ReplayCollision[]>;
}

export interface ReplayRunOptions {
  case: ReplayCase;
  vertical: VerticalPack;
  reconstructor: Reconstructor;
  gatePredictor?: ReplayGatePredictor;
  collisionDetector?: ReplayCollisionDetector;
  now?: string;
}

export interface ReplayCandidateScore {
  seed_found: boolean;
  best_overlap: number;
  variant_coverage: number;
}

export interface ReplayCollisionScore {
  available: boolean;
  precision: number | null;
  recall: number | null;
}

export interface ReplayGateScore {
  available: boolean;
  agreement: number | null;
  compared: number;
}

export interface ReplayClaimScore {
  total: number;
  unsupported: number;
  verified: number;
}

export interface ReplayResult {
  case_id: string;
  illustrative: boolean;
  idea_id: string;
  candidate: ReplayCandidateScore;
  collision: ReplayCollisionScore;
  gate: ReplayGateScore;
  claims: ReplayClaimScore;
  passed: boolean;
}

const VARIANTS = ["conservative", "ambitious", "cross_domain"] as const;
const SEED_OVERLAP_THRESHOLD = 0.2;
const GATE_AGREEMENT_THRESHOLD = 0.75;

const STOPWORDS = new Set([
  "the",
  "and",
  "was",
  "were",
  "with",
  "from",
  "that",
  "this",
  "for",
  "are",
  "has",
  "have",
  "not",
  "but",
  "its",
  "into",
  "than",
  "then",
  "over",
  "under",
  "between",
  "within",
  "can",
  "may",
  "will",
  "would",
  "could",
  "should",
  "our",
  "their",
  "there",
  "these",
  "those",
  "which",
  "what",
  "when",
  "where",
  "who",
  "how",
  "why",
  "all",
  "any",
  "each",
  "more",
  "most",
  "some",
  "such",
  "only",
  "also",
  "been",
  "being",
  "does",
  "did",
  "doing",
  "about",
  "above",
  "after",
  "again",
  "against",
  "because",
  "before",
  "below",
  "during",
  "once",
  "here",
  "just",
  "very",
]);

function words(text: string): Set<string> {
  const matches = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return new Set(
    matches.filter(
      (word) => word.length >= 3 && !STOPWORDS.has(word),
    ),
  );
}

function overlap(a: string, b: string): number {
  const left = words(a);
  const right = words(b);
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const word of left) {
    if (right.has(word)) shared += 1;
  }
  // Jaccard: a one-word hypothesis must not score 1.0 against a long seed.
  const union = left.size + right.size - shared;
  return shared / union;
}

function scoreCandidate(idea: Idea, replay: ReplayCase): ReplayCandidateScore {
  const seed = replay.expected_candidates.find((candidate) => candidate.is_seed);
  const best = seed
    ? idea.hypotheses.reduce(
        (max, hypothesis) =>
          Math.max(max, overlap(hypothesis.statement, seed.statement)),
        0,
      )
    : 0;
  const variants = new Set(idea.hypotheses.map((hypothesis) => hypothesis.variant));
  const covered = VARIANTS.filter((variant) => variants.has(variant)).length;
  return {
    seed_found: best >= SEED_OVERLAP_THRESHOLD,
    best_overlap: best,
    variant_coverage: covered / VARIANTS.length,
  };
}

function scoreGates(
  replay: ReplayCase,
  predictions: Record<string, ReplayGateVerdict> | null,
): ReplayGateScore {
  if (predictions === null) {
    return { available: false, agreement: null, compared: 0 };
  }
  const labels = new Map(
    replay.gate_labels.map((label) => [label.gate, label.expected]),
  );
  const compared = [...labels.keys()].filter(
    (gate) => gate in predictions,
  );
  if (compared.length === 0) {
    return { available: true, agreement: null, compared: 0 };
  }
  const matches = compared.filter(
    (gate) => predictions[gate] === labels.get(gate),
  ).length;
  return {
    available: true,
    agreement: matches / compared.length,
    compared: compared.length,
  };
}

function scoreCollisions(
  replay: ReplayCase,
  detected: ReplayCollision[] | null,
): ReplayCollisionScore {
  if (detected === null) {
    return { available: false, precision: null, recall: null };
  }
  const expected = new Set(
    replay.collisions.map(
      (collision) => `${collision.kind}:${collision.prior_art_id}`,
    ),
  );
  const actual = new Set(
    detected.map(
      (collision) => `${collision.kind}:${collision.prior_art_id}`,
    ),
  );
  const truePositives = [...actual].filter((key) => expected.has(key)).length;
  return {
    available: true,
    precision: actual.size === 0 ? 1 : truePositives / actual.size,
    recall: expected.size === 0 ? 1 : truePositives / expected.size,
  };
}

export async function runReplayCase(
  options: ReplayRunOptions,
): Promise<ReplayResult> {
  const now = options.now ?? new Date().toISOString();
  const developed = await develop({
    fragment: options.case.fragment,
    vertical: options.vertical,
    reconstructor: options.reconstructor,
    constraint: options.case.constraints,
    now,
  });

  const publicCase = replayPublicCase(options.case);
  const predictions = options.gatePredictor
    ? await options.gatePredictor.predict({
        case: publicCase,
        idea: developed.idea,
        claims: developed.claims,
      })
    : null;
  const detected = options.collisionDetector
    ? await options.collisionDetector.detect({
        case: publicCase,
        idea: developed.idea,
      })
    : null;

  const candidate = scoreCandidate(developed.idea, options.case);
  const collision = scoreCollisions(options.case, detected);
  const gate = scoreGates(options.case, predictions);
  const claims: ReplayClaimScore = {
    total: developed.claims.length,
    unsupported: developed.claims.filter(blocksBrief).length,
    verified: developed.claims.filter((claim) => claim.status === "verified")
      .length,
  };
  // `passed` deliberately covers candidate recovery, unsupported claims and gate
  // agreement only. Variant coverage and collision precision/recall are reported
  // as measurements; they are not pass/fail thresholds (see data/replay/README.md).
  const passed =
    candidate.seed_found &&
    claims.unsupported === 0 &&
    (!gate.available || (gate.agreement ?? 0) >= GATE_AGREEMENT_THRESHOLD);

  return {
    case_id: options.case.metadata.id,
    illustrative: options.case.metadata.illustrative,
    idea_id: developed.idea.id,
    candidate,
    collision,
    gate,
    claims,
    passed,
  };
}

export function renderReplayMarkdown(result: ReplayResult): string {
  const gate = result.gate.available
    ? `${
        result.gate.agreement === null
          ? "n/a"
          : result.gate.agreement.toFixed(2)
      } over ${result.gate.compared} gate(s)`
    : "unavailable";
  const collision = result.collision.available
    ? `precision ${
        result.collision.precision === null
          ? "n/a"
          : result.collision.precision.toFixed(2)
      }, recall ${
        result.collision.recall === null
          ? "n/a"
          : result.collision.recall.toFixed(2)
      }`
    : "unavailable";
  return [
    `# Replay ${result.case_id}`,
    "",
    `- illustrative: ${result.illustrative}`,
    `- passed: ${result.passed}`,
    `- seed found: ${result.candidate.seed_found} (best overlap ${result.candidate.best_overlap.toFixed(2)}, variant coverage ${result.candidate.variant_coverage.toFixed(2)})`,
    `- claims: ${result.claims.total} total, ${result.claims.unsupported} unsupported, ${result.claims.verified} verified`,
    `- gate: ${gate}`,
    `- collision: ${collision}`,
    "",
  ].join("\n");
}
