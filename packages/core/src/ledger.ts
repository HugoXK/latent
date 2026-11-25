import type { Claim } from "./types.js";

export interface ClaimIssue {
  claimId: string;
  code: string;
  message: string;
}

export function validateClaim(claim: Claim): ClaimIssue[] {
  const issues: ClaimIssue[] = [];

  if (claim.status === "verified") {
    const supported = claim.sources.some(
      (s) => typeof s.span === "string" && s.span.trim().length > 0,
    );
    if (!supported) {
      issues.push({
        claimId: claim.id,
        code: "UNSUPPORTED_VERIFIED",
        message: "A verified claim needs a source span, not just a URL.",
      });
    }
    if (claim.confidence_basis === "C") {
      issues.push({
        claimId: claim.id,
        code: "C_CANNOT_BE_VERIFIED",
        message:
          "A grade-C component must be re-characterised before it can be verified.",
      });
    }
  }

  if (
    claim.status === "contradicted" &&
    (claim.contradictions ?? []).length === 0
  ) {
    issues.push({
      claimId: claim.id,
      code: "CONTRADICTION_WITHOUT_SOURCE",
      message: "A contradicted claim needs at least one contradicting source.",
    });
  }

  if (
    typeof claim.value === "number" &&
    (claim.unit === null || claim.unit === undefined || claim.unit.trim() === "")
  ) {
    issues.push({
      claimId: claim.id,
      code: "NUMERIC_WITHOUT_UNIT",
      message: "A numeric claim needs a unit.",
    });
  }

  if (claim.confidence < 0 || claim.confidence > 1) {
    issues.push({
      claimId: claim.id,
      code: "CONFIDENCE_OUT_OF_RANGE",
      message: "Confidence must be between 0 and 1.",
    });
  }

  return issues;
}

export function validateLedger(claims: Claim[]): ClaimIssue[] {
  return claims.flatMap(validateClaim);
}

export function blocksBrief(claim: Claim): boolean {
  return claim.status === "unsupported";
}

export function contradictedClaims(claims: Claim[]): Claim[] {
  return claims.filter((c) => c.status === "contradicted");
}
