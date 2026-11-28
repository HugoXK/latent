import { findContradictions } from "./contradiction.js";
import type { ContradictionProvider } from "./contradiction.js";
import { applyExistence, checkClaimExistence } from "./existence.js";
import type { ExistenceCheck, ExistenceProvider } from "./existence.js";
import { verifyClaims } from "./verifier.js";
import type { ClaimVerification, ClaimVerifier } from "./verifier.js";
import type { Claim, Source } from "./types.js";

export interface EvidenceOptions {
  verifier?: ClaimVerifier;
  contradiction?: ContradictionProvider;
  existence?: ExistenceProvider;
  now?: string;
}

export interface EvidenceReport {
  claims: Claim[];
  verifications: ClaimVerification[];
  contradictions: Map<string, Source[]>;
  existence: Map<string, ExistenceCheck>;
}

/**
 * Run the evidence checks in a fixed order. A claim can only be demoted, never
 * promoted: the pipeline starts from the current status and each check may turn
 * a `verified` claim into `unsupported` or `contradicted`.
 */
export async function verifyEvidence(
  claims: Claim[],
  options: EvidenceOptions = {},
): Promise<EvidenceReport> {
  let current = claims;
  let verifications: ClaimVerification[] = [];
  const contradictions = new Map<string, Source[]>();
  const existence = new Map<string, ExistenceCheck>();

  if (options.verifier) {
    const result = await verifyClaims(current, options.verifier);
    current = result.claims;
    verifications = result.results;
  }
  if (options.contradiction) {
    const result = await findContradictions(
      current,
      options.contradiction,
      options.now,
    );
    current = result.claims;
    for (const [id, sources] of result.results) {
      contradictions.set(id, sources);
    }
  }
  if (options.existence) {
    const provider = options.existence;
    current = await Promise.all(
      current.map(async (claim) => {
        const check = await checkClaimExistence(claim, provider);
        existence.set(claim.id, check);
        return applyExistence(claim, check.results, options.now);
      }),
    );
  }

  return { claims: current, verifications, contradictions, existence };
}
