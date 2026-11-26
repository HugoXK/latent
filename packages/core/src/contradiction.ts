import type { Claim, Source } from "./types.js";

export interface ContradictionProvider {
  find(claim: Claim): Promise<Source[]>;
}

/** Deterministic fixtures for the contradiction port. */
export class FixtureContradictionProvider implements ContradictionProvider {
  constructor(
    private readonly byClaim: Record<string, Source[]> = {},
  ) {}

  async find(claim: Claim): Promise<Source[]> {
    return this.byClaim[claim.id] ?? [];
  }
}

export function applyContradictions(
  claim: Claim,
  sources: Source[],
  now = new Date().toISOString(),
): Claim {
  if (sources.length === 0) return claim;
  return {
    ...claim,
    status: "contradicted",
    contradictions: [...(claim.contradictions ?? []), ...sources],
    verifier: "contradiction-v1",
    verified_at: now,
  };
}

export interface FindContradictionsResult {
  claims: Claim[];
  results: Map<string, Source[]>;
}

export async function findContradictions(
  claims: Claim[],
  provider: ContradictionProvider,
  now = new Date().toISOString(),
): Promise<FindContradictionsResult> {
  const results = new Map<string, Source[]>();
  const updated: Claim[] = [];
  for (const claim of claims) {
    const sources = await provider.find(claim);
    results.set(claim.id, sources);
    updated.push(applyContradictions(claim, sources, now));
  }
  return { claims: updated, results };
}
