import type { BriefCollision } from "@latent/core";
import { NoveltyGraph } from "./graph.js";
import type {
  CandidateMechanism,
  CollisionReport,
} from "./types.js";

export * from "./types.js";
export * from "./canon.js";
export * from "./graph.js";
export * from "./collision.js";
export * from "./render.js";
export * from "./blast.js";

export interface PriorArtEntry {
  id: string;
  label: string;
  mechanism: string;
  interface: string;
  host: string;
  readout: string;
  substrate?: string;
  url?: string;
}

/** Build the typed graph from a simple prior-art list; ids must be unique. */
export function graphFromPriorArt(
  entries: readonly PriorArtEntry[],
): NoveltyGraph {
  const graph = new NoveltyGraph();
  for (const entry of entries) {
    graph.addProject(entry.id, entry.label, {
      mechanism: entry.mechanism,
      interface: entry.interface,
      host: entry.host,
      readout: entry.readout,
      ...(entry.substrate ? { substrate: entry.substrate } : {}),
    });
  }
  return graph;
}

export function priorArtSourceUrls(
  entries: readonly PriorArtEntry[],
): Record<string, string> {
  const urls: Record<string, string> = {};
  for (const entry of entries) {
    if (entry.url) urls[entry.id] = entry.url;
  }
  return urls;
}

/** Map a collision report into the structured brief field. */
export function toBriefCollisions(
  report: CollisionReport,
  options: {
    sourceUrls?: Record<string, string>;
    claimIds?: string[];
  } = {},
): BriefCollision[] {
  return report.hits.map((hit) => ({
    kind: hit.kind,
    prior_id: hit.prior_id,
    prior_label: hit.prior_label,
    severity: hit.severity,
    note: hit.note,
    claim_ids: options.claimIds ?? [],
    source_url: options.sourceUrls?.[hit.prior_id] ?? null,
  }));
}
