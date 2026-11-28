import { createHash } from "node:crypto";
import type { ModelProvider } from "./ports.js";
import type { Claim } from "./types.js";

export interface ClaimVerification {
  claim_id: string;
  supported: boolean;
  reason: string;
  verifier: string;
  checked_at: string;
  span_hash: string | null;
}

export interface ClaimVerifier {
  verify(claim: Claim): Promise<ClaimVerification>;
}

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

function tokens(text: string): Set<string> {
  const matches = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return new Set(
    matches.filter(
      (token) => token.length >= 3 && !STOPWORDS.has(token),
    ),
  );
}

const NEGATION_CUES = new Set([
  "not",
  "no",
  "never",
  "none",
  "cannot",
  "without",
  "lacks",
  "lack",
  "absent",
  "fails",
  "failed",
  "fail",
  "unable",
]);

function words(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

function negated(text: string): boolean {
  return words(text).some((word) => NEGATION_CUES.has(word));
}

// Curated chassis / species aliases. Matching only runs when both the claim and
// the span name a host; a span that omits the host is not a contradiction.
const CHASSIS: Array<[RegExp, string]> = [
  [/\be coli\b/, "ecoli"],
  [/\bescherichia coli\b/, "ecoli"],
  [/\bb subtilis\b/, "bsubtilis"],
  [/\bbacillus subtilis\b/, "bsubtilis"],
  [/\bs cerevisiae\b/, "yeast"],
  [/\bsaccharomyces cerevisiae\b/, "yeast"],
  [/\byeast\b/, "yeast"],
  [/\bp putida\b/, "pputida"],
  [/\bpseudomonas putida\b/, "pputida"],
  [/\bc reinhardtii\b/, "chlamy"],
  [/\bchlamydomonas reinhardtii\b/, "chlamy"],
  [/\bhela\b/, "hela"],
  [/\bhek293\b/, "hek293"],
  [/\bhuman\b/, "human"],
  [/\bmouse\b/, "mouse"],
];

function chassis(text: string): Set<string> {
  const normalized = words(text).join(" ");
  const found = new Set<string>();
  for (const [pattern, name] of CHASSIS) {
    if (pattern.test(normalized)) found.add(name);
  }
  return found;
}

function supports(claimText: string, span: string): boolean {
  // A span that states the opposite polarity is not support, however many terms
  // it shares: "does not respond" vs "responds" has the same token set.
  if (negated(claimText) !== negated(span)) return false;
  // A span about another chassis is not support for a claim about this one.
  const claimHosts = chassis(claimText);
  const spanHosts = chassis(span);
  if (claimHosts.size > 0 && spanHosts.size > 0) {
    let shared = false;
    for (const host of claimHosts) {
      if (spanHosts.has(host)) shared = true;
    }
    if (!shared) return false;
  }
  const claimTokens = tokens(claimText);
  if (claimTokens.size === 0) return false;
  const spanTokens = tokens(span);
  let overlap = 0;
  for (const token of claimTokens) {
    if (spanTokens.has(token)) overlap += 1;
  }
  // Conservative rule: a span supports a claim only when it covers at least
  // two claim terms and at least 60% of them. A plain two-token overlap marked
  // an unrelated span ("the protein was purified in vitro") as support for a
  // different claim, i.e. fabricated evidence under AGENTS.md rule 2.
  const required = Math.max(
    Math.min(2, claimTokens.size),
    Math.ceil(claimTokens.size * 0.6),
  );
  return overlap >= required;
}

function firstSpan(claim: Claim): string | null {
  for (const source of claim.sources) {
    const span = source.span;
    if (typeof span === "string" && span.trim().length > 0) return span;
  }
  return null;
}

export function spanHash(span: string): string {
  return createHash("sha256").update(span).digest("hex");
}

export interface DeterministicClaimVerifierOptions {
  now?: () => string;
}

/**
 * A deterministic, offline support check. It is not an entailment model: it
 * requires a source span and a minimum overlap of the claim's key terms. A
 * claim with a URL but no span is never supported.
 */
export class DeterministicClaimVerifier implements ClaimVerifier {
  readonly #now: () => string;

  constructor(options: DeterministicClaimVerifierOptions = {}) {
    this.#now = options.now ?? (() => new Date().toISOString());
  }

  async verify(claim: Claim): Promise<ClaimVerification> {
    const checkedAt = this.#now();
    if (claim.status !== "verified") {
      return {
        claim_id: claim.id,
        supported: true,
        reason: "not a verified claim; no demotion",
        verifier: "deterministic-span-v1",
        checked_at: checkedAt,
        span_hash: null,
      };
    }
    const span = firstSpan(claim);
    if (span === null) {
      return {
        claim_id: claim.id,
        supported: false,
        reason: "no source span",
        verifier: "deterministic-span-v1",
        checked_at: checkedAt,
        span_hash: null,
      };
    }
    const supported = supports(claim.text, span);
    return {
      claim_id: claim.id,
      supported,
      reason: supported
        ? "span shares the claim's key terms"
        : "span does not support the claim",
      verifier: "deterministic-span-v1",
      checked_at: checkedAt,
      span_hash: spanHash(span),
    };
  }
}

export interface ModelClaimVerifierOptions {
  now?: () => string;
}

/**
 * An optional model-backed support check. It fails closed: a model error, an
 * empty span or an unparseable verdict is unsupported, not a pass.
 */
export class ModelClaimVerifier implements ClaimVerifier {
  readonly #model: ModelProvider;
  readonly #now: () => string;

  constructor(model: ModelProvider, options: ModelClaimVerifierOptions = {}) {
    this.#model = model;
    this.#now = options.now ?? (() => new Date().toISOString());
  }

  async verify(claim: Claim): Promise<ClaimVerification> {
    const checkedAt = this.#now();
    if (claim.status !== "verified") {
      return {
        claim_id: claim.id,
        supported: true,
        reason: "not a verified claim; no demotion",
        verifier: "model-span-v1",
        checked_at: checkedAt,
        span_hash: null,
      };
    }
    const span = firstSpan(claim);
    if (span === null) {
      return {
        claim_id: claim.id,
        supported: false,
        reason: "no source span",
        verifier: "model-span-v1",
        checked_at: checkedAt,
        span_hash: null,
      };
    }

    let text = "";
    try {
      const output = await this.#model.complete({
        system:
          "You verify whether a source span supports a claim. Be strict. If the span does not directly support the claim, return supported=false. Never invent a source. Return JSON only.",
        prompt: `Claim:\n${claim.text}\n\nSource span:\n"""${span}"""\n\nReturn JSON only: {"supported": true|false, "reason": string}`,
      });
      text = output.text;
    } catch (error) {
      return {
        claim_id: claim.id,
        supported: false,
        reason: `verifier error: ${
          error instanceof Error ? error.message : String(error)
        }`,
        verifier: "model-span-v1",
        checked_at: checkedAt,
        span_hash: spanHash(span),
      };
    }

    const stripped = text
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();
    let parsed: { supported?: unknown; reason?: unknown };
    try {
      parsed = JSON.parse(stripped) as {
        supported?: unknown;
        reason?: unknown;
      };
    } catch {
      return {
        claim_id: claim.id,
        supported: false,
        reason: "model returned invalid JSON",
        verifier: "model-span-v1",
        checked_at: checkedAt,
        span_hash: spanHash(span),
      };
    }
    if (
      typeof parsed.supported !== "boolean" ||
      typeof parsed.reason !== "string"
    ) {
      return {
        claim_id: claim.id,
        supported: false,
        reason: "model returned an invalid verdict",
        verifier: "model-span-v1",
        checked_at: checkedAt,
        span_hash: spanHash(span),
      };
    }
    return {
      claim_id: claim.id,
      supported: parsed.supported,
      reason: parsed.reason,
      verifier: "model-span-v1",
      checked_at: checkedAt,
      span_hash: spanHash(span),
    };
  }
}

export function applyVerification(
  claim: Claim,
  result: ClaimVerification,
): Claim {
  if (result.claim_id !== claim.id) {
    throw new Error(
      `verification ${result.claim_id} does not match claim ${claim.id}`,
    );
  }
  if (claim.status !== "verified") {
    return claim;
  }
  if (!result.supported) {
    return {
      ...claim,
      status: "unsupported",
      verifier: result.verifier,
      verified_at: result.checked_at,
    };
  }
  return {
    ...claim,
    verifier: result.verifier,
    verified_at: result.checked_at,
  };
}

export interface VerifyClaimsResult {
  claims: Claim[];
  results: ClaimVerification[];
}

export async function verifyClaims(
  claims: Claim[],
  verifier: ClaimVerifier,
): Promise<VerifyClaimsResult> {
  const results: ClaimVerification[] = [];
  const verified: Claim[] = [];
  for (const claim of claims) {
    const result = await verifier.verify(claim);
    results.push(result);
    verified.push(applyVerification(claim, result));
  }
  return { claims: verified, results };
}
