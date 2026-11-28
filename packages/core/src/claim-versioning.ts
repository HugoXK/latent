import { applyVerification, spanHash } from "./verifier.js";
import type { ClaimVerification, ClaimVerifier } from "./verifier.js";
import type { Claim, Source } from "./types.js";

export interface ClaimSourceSnapshot {
  kind: Source["kind"];
  url: string;
  span_hash: string | null;
  snapshot_hash: string | null;
}

export interface ClaimSnapshot {
  claim_id: string;
  version: string;
  created_at: string;
  sources: ClaimSourceSnapshot[];
}

export type SourceChangeCode =
  | "SPAN_CHANGED"
  | "SNAPSHOT_CHANGED"
  | "REMOVED"
  | "ADDED";

export interface SourceChange {
  code: SourceChangeCode;
  url: string;
}

export function snapshotClaim(
  claim: Claim,
  now = new Date().toISOString(),
): ClaimSnapshot {
  const sources = claim.sources.map((source) => ({
    kind: source.kind,
    url: source.url,
    span_hash: source.span ? spanHash(source.span) : null,
    snapshot_hash: source.snapshot_hash ?? null,
  }));
  return {
    claim_id: claim.id,
    version: spanHash(JSON.stringify(sources)),
    created_at: now,
    sources,
  };
}

export function detectSourceChanges(
  snapshot: ClaimSnapshot,
  current: Source[],
): SourceChange[] {
  const changes: SourceChange[] = [];
  const currentByUrl = new Map(current.map((source) => [source.url, source]));
  const snapshotUrls = new Set(snapshot.sources.map((source) => source.url));

  for (const source of snapshot.sources) {
    const next = currentByUrl.get(source.url);
    if (!next) {
      changes.push({ code: "REMOVED", url: source.url });
      continue;
    }
    const nextSpan = next.span ? spanHash(next.span) : null;
    if (nextSpan !== source.span_hash) {
      changes.push({ code: "SPAN_CHANGED", url: source.url });
      continue;
    }
    if ((next.snapshot_hash ?? null) !== source.snapshot_hash) {
      changes.push({ code: "SNAPSHOT_CHANGED", url: source.url });
    }
  }

  for (const source of current) {
    if (!snapshotUrls.has(source.url)) {
      changes.push({ code: "ADDED", url: source.url });
    }
  }
  return changes;
}

export interface ReverifyResult {
  claim: Claim;
  changes: SourceChange[];
  verification: ClaimVerification | null;
}

/**
 * Re-verify only when a source span, snapshot or URL set changed. A changed
 * source is a new head: the previous PASS is not carried over.
 */
export async function reverifyClaim(
  claim: Claim,
  snapshot: ClaimSnapshot,
  verifier: ClaimVerifier,
): Promise<ReverifyResult> {
  const changes = detectSourceChanges(snapshot, claim.sources);
  if (changes.length === 0) {
    return { claim, changes, verification: null };
  }
  const verification = await verifier.verify(claim);
  return {
    claim: applyVerification(claim, verification),
    changes,
    verification,
  };
}
