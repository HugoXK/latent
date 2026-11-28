import type { Claim, Source } from "./types.js";

export type ExistenceKind = "part" | "paper" | "doi";

export interface ExistenceQuery {
  kind: ExistenceKind;
  id: string;
}

export interface ExistenceResult extends ExistenceQuery {
  exists: boolean | null;
  source: string;
  checked_at: string;
  detail?: string | null;
}

export interface ExistenceProvider {
  check(query: ExistenceQuery): Promise<ExistenceResult>;
}

export interface ExistenceIssue {
  code: string;
  message: string;
}

export interface ExistenceCheck {
  claim_id: string;
  ok: boolean;
  results: ExistenceResult[];
  issues: ExistenceIssue[];
}

export function existenceKind(source: Source): ExistenceKind | null {
  if (source.kind === "registry") return "part";
  if (source.kind === "paper") return "paper";
  return null;
}

export interface FixtureExistenceOptions {
  exists?: Partial<Record<ExistenceKind, string[]>>;
  missing?: Partial<Record<ExistenceKind, string[]>>;
  offline?: boolean;
  now?: () => string;
}

/**
 * Deterministic fixtures for the existence port. An ID that is in neither list
 * is `null` (unknown), not a pass: a registry outage must not become a PASS.
 */
export class FixtureExistenceProvider implements ExistenceProvider {
  constructor(private readonly options: FixtureExistenceOptions = {}) {}

  async check(query: ExistenceQuery): Promise<ExistenceResult> {
    const checkedAt = (this.options.now ?? (() => new Date().toISOString()))();
    if (this.options.offline === true) {
      return {
        ...query,
        exists: null,
        source: "fixture-offline",
        checked_at: checkedAt,
        detail: "provider offline",
      };
    }
    const exists = this.options.exists?.[query.kind] ?? [];
    const missing = this.options.missing?.[query.kind] ?? [];
    if (exists.includes(query.id)) {
      return {
        ...query,
        exists: true,
        source: "fixture",
        checked_at: checkedAt,
        detail: "present in the fixture",
      };
    }
    if (missing.includes(query.id)) {
      return {
        ...query,
        exists: false,
        source: "fixture",
        checked_at: checkedAt,
        detail: "absent from the fixture",
      };
    }
    return {
      ...query,
      exists: null,
      source: "fixture",
      checked_at: checkedAt,
      detail: "not in the fixture",
    };
  }
}

export interface CachedExistenceOptions {
  rateLimitMs?: number;
  now?: () => number;
}

/** Cache and rate-limit an existence provider; a repeated query is free. */
export class CachedExistenceProvider implements ExistenceProvider {
  readonly #inner: ExistenceProvider;
  readonly #cache = new Map<string, ExistenceResult>();
  readonly #rateLimitMs: number;
  readonly #now: () => number;
  #last = 0;

  constructor(inner: ExistenceProvider, options: CachedExistenceOptions = {}) {
    this.#inner = inner;
    this.#rateLimitMs = options.rateLimitMs ?? 0;
    this.#now = options.now ?? (() => Date.now());
  }

  async check(query: ExistenceQuery): Promise<ExistenceResult> {
    const key = `${query.kind}:${query.id}`;
    const cached = this.#cache.get(key);
    if (cached) return cached;
    const gap = this.#rateLimitMs - (this.#now() - this.#last);
    if (gap > 0) {
      await new Promise((resolve) => setTimeout(resolve, gap));
    }
    this.#last = this.#now();
    const result = await this.#inner.check(query);
    this.#cache.set(key, result);
    return result;
  }
}

export async function checkClaimExistence(
  claim: Claim,
  provider: ExistenceProvider,
): Promise<ExistenceCheck> {
  const results: ExistenceResult[] = [];
  for (const source of claim.sources) {
    const kind = existenceKind(source);
    if (!kind) continue;
    results.push(await provider.check({ kind, id: source.url }));
  }
  const issues: ExistenceIssue[] = results.flatMap((result) => {
    if (result.exists === true) return [];
    return [
      {
        code:
          result.exists === false ? "MISSING_OBJECT" : "EXISTENCE_UNKNOWN",
        message:
          result.exists === false
            ? `${result.id} does not exist`
            : `${result.id} could not be verified; failing closed`,
      },
    ];
  });
  return {
    claim_id: claim.id,
    ok: issues.length === 0,
    results,
    issues,
  };
}

export function applyExistence(
  claim: Claim,
  results: ExistenceResult[],
  now = new Date().toISOString(),
): Claim {
  if (claim.status !== "verified" || results.length === 0) return claim;
  if (results.some((result) => result.exists !== true)) {
    return {
      ...claim,
      status: "unsupported",
      verifier: "existence-v1",
      verified_at: now,
    };
  }
  return { ...claim, verifier: "existence-v1", verified_at: now };
}
