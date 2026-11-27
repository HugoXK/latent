import { newId } from "./ids.js";
import { isLiveEdge } from "./memory.js";
import type { AgentRuntime } from "./ports.js";
import type {
  MemoryEdge,
  Suggestion,
  SuggestionKind,
  SuggestionNode,
  SuggestionStatus,
} from "./types.js";

export interface IncubationNode {
  ref: SuggestionNode;
  text: string;
  created_at?: string;
  updated_at?: string;
}

export interface IncubationInput {
  owner_id: string;
  job_id: string;
  seed: SuggestionNode;
  nodes: readonly IncubationNode[];
  edges?: readonly MemoryEdge[];
  existing?: ReadonlyArray<{ from: SuggestionNode; to: SuggestionNode }>;
  budget: number;
  min_score?: number;
  since?: string | null;
  now?: string;
}

export interface IncubationResult {
  suggestions: Suggestion[];
  spent: number;
  skipped: number;
}

export interface Digest {
  generated_at: string;
  since: string | null;
  proposed_count: number;
  by_kind: Record<SuggestionKind, number>;
  items: Suggestion[];
}

export class IncubationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "IncubationError";
    this.code = code;
  }
}

export class SuggestionError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "SuggestionError";
    this.code = code;
  }
}

const STOPWORDS = new Set([
  "the", "and", "was", "were", "with", "from", "that", "this", "for",
  "are", "has", "have", "not", "but", "into", "than", "then", "over",
  "under", "between", "within", "can", "may", "will", "would", "could",
  "should", "our", "their", "there", "these", "those", "which", "what",
  "when", "where", "who", "how", "why", "all", "any", "each", "more",
  "most", "some", "such", "only", "also", "been", "being", "does", "did",
  "doing", "about", "above", "after", "again", "against", "because",
  "before", "below", "during", "once", "here", "just", "very", "using",
  "used", "use", "via", "with", "without", "make", "made", "need", "needs",
]);

function terms(text: string): Set<string> {
  const lower = text.toLowerCase();
  const words = (lower.match(/[a-z0-9]{2,}/g) ?? []).filter(
    (word) => !STOPWORDS.has(word),
  );
  const cjk = lower.match(/[\p{Script=Han}]/gu) ?? [];
  const bigrams: string[] = [];
  for (let index = 0; index < cjk.length - 1; index += 1) {
    bigrams.push(`${cjk[index]}${cjk[index + 1]}`);
  }
  return new Set([...words, ...bigrams]);
}

function nodeKey(node: SuggestionNode): string {
  return `${node.type}:${node.id}`;
}

function edgeKey(a: SuggestionNode, b: SuggestionNode): string {
  return [nodeKey(a), nodeKey(b)].sort().join("|");
}

function scorePair(a: Set<string>, b: Set<string>): {
  score: number;
  shared: string[];
} {
  if (a.size === 0 || b.size === 0) return { score: 0, shared: [] };
  const shared: string[] = [];
  for (const term of a) {
    if (b.has(term)) shared.push(term);
  }
  const union = a.size + b.size - shared.length;
  return {
    score: union === 0 ? 0 : shared.length / union,
    shared: shared.sort(),
  };
}

/**
 * Propose connections between a seed node and the user's memory. The engine is
 * deterministic and budgeted: it never spends more than `budget` credits, never
 * edits another node, and skips pairs already linked by a live edge.
 */
export function planIncubation(input: IncubationInput): IncubationResult {
  if (input.owner_id.trim() === "") {
    throw new IncubationError("OWNER_REQUIRED", "An incubation job needs an owner.");
  }
  if (input.job_id.trim() === "") {
    throw new IncubationError("JOB_REQUIRED", "An incubation job needs a job id.");
  }
  if (!Number.isFinite(input.budget) || input.budget < 0) {
    throw new IncubationError("INVALID_BUDGET", "budget must be a number >= 0.");
  }
  const minScore = input.min_score ?? 0.2;
  if (!Number.isFinite(minScore) || minScore < 0 || minScore > 1) {
    throw new IncubationError(
      "INVALID_MIN_SCORE",
      "min_score must be between 0 and 1.",
    );
  }

  const seed = input.nodes.find(
    (node) => nodeKey(node.ref) === nodeKey(input.seed),
  );
  if (!seed) {
    return { suggestions: [], spent: 0, skipped: input.nodes.length };
  }

  const linked = new Set<string>();
  for (const edge of input.edges ?? []) {
    if (!isLiveEdge(edge)) continue;
    linked.add(edgeKey(edge.from, edge.to));
  }
  for (const pair of input.existing ?? []) {
    linked.add(edgeKey(pair.from, pair.to));
  }

  const seedTerms = terms(seed.text);
  const candidates: Array<{ node: IncubationNode; score: number; shared: string[] }> = [];
  let skipped = 0;

  for (const node of input.nodes) {
    if (nodeKey(node.ref) === nodeKey(seed.ref)) continue;
    if (linked.has(edgeKey(seed.ref, node.ref))) {
      skipped += 1;
      continue;
    }
    const { score, shared } = scorePair(seedTerms, terms(node.text));
    if (score < minScore) {
      skipped += 1;
      continue;
    }
    candidates.push({ node, score, shared });
  }

  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return nodeKey(a.node.ref).localeCompare(nodeKey(b.node.ref));
  });

  const now = input.now ?? new Date().toISOString();
  const suggestions: Suggestion[] = [];
  for (const candidate of candidates) {
    if (suggestions.length + 1 > input.budget) {
      skipped += 1;
      continue;
    }
    const updated =
      candidate.node.updated_at ?? candidate.node.created_at ?? null;
    const kind: SuggestionKind =
      input.since != null && updated != null && updated < input.since
        ? "resurface"
        : "connection";
    suggestions.push({
      id: newId("sug"),
      owner_id: input.owner_id,
      job_id: input.job_id,
      kind,
      from: seed.ref,
      to: candidate.node.ref,
      reason: `shared terms: ${candidate.shared.slice(0, 5).join(", ")}`,
      score: Math.round(candidate.score * 1000) / 1000,
      budget_cost: 1,
      status: "proposed",
      created_at: now,
      decided_at: null,
      decided_by: null,
      schema_version: "1.0.0",
    });
  }

  return { suggestions, spent: suggestions.length, skipped };
}

/**
 * Run the job through the runtime port, then execute it locally. The port is the
 * seam for FlyBot or another scheduler; the local path stays deterministic.
 */
export async function runIncubation(
  input: IncubationInput,
  runtime?: AgentRuntime,
): Promise<IncubationResult> {
  if (runtime) {
    await runtime.schedule({
      id: input.job_id,
      kind: "incubate",
      payload: {
        seed: input.seed,
        budget: input.budget,
        since: input.since ?? null,
      },
    });
  }
  return planIncubation(input);
}

const SUGGESTION_TRANSITIONS: Record<
  SuggestionStatus,
  readonly SuggestionStatus[]
> = {
  proposed: ["accepted", "rejected", "revoked"],
  accepted: ["revoked"],
  rejected: [],
  revoked: [],
};

export function canDecideSuggestion(
  from: SuggestionStatus,
  to: SuggestionStatus,
): boolean {
  return SUGGESTION_TRANSITIONS[from].includes(to);
}

export function decideSuggestion(
  suggestion: Suggestion,
  status: Exclude<SuggestionStatus, "proposed">,
  now = new Date().toISOString(),
): Suggestion {
  if (!canDecideSuggestion(suggestion.status, status)) {
    throw new SuggestionError(
      "ILLEGAL_SUGGESTION_TRANSITION",
      `Cannot move a suggestion from ${suggestion.status} to ${status}.`,
    );
  }
  return {
    ...suggestion,
    status,
    decided_at: now,
    decided_by: "human",
  };
}

/** A weekly digest is a read-only view; it does not accept or reject anything. */
export function buildDigest(
  suggestions: readonly Suggestion[],
  options: { since?: string | null; now?: string } = {},
): Digest {
  const since = options.since ?? null;
  const items = suggestions
    .filter(
      (suggestion) =>
        suggestion.status === "proposed" &&
        (since === null || suggestion.created_at >= since),
    )
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.id.localeCompare(b.id);
    });
  const byKind: Record<SuggestionKind, number> = {
    connection: 0,
    resurface: 0,
    contradiction: 0,
    duplicate: 0,
  };
  for (const item of items) byKind[item.kind] += 1;
  return {
    generated_at: options.now ?? new Date().toISOString(),
    since,
    proposed_count: items.length,
    by_kind: byKind,
    items,
  };
}
