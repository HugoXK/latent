import type { BriefCollision } from "@latent/core";
import type { CollisionReport } from "./types.js";

export * from "./types.js";
export * from "./canon.js";
export * from "./graph.js";
export * from "./collision.js";
export * from "./render.js";

/** Map a collision report into the structured brief field. */
export function toBriefCollisions(
  report: CollisionReport,
): BriefCollision[] {
  return report.hits.map((hit) => ({
    kind: hit.kind,
    prior_id: hit.prior_id,
    prior_label: hit.prior_label,
    severity: hit.severity,
    note: hit.note,
  }));
}
