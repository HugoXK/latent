import { canonicalize } from "./canon.js";
import type { NoveltyGraph } from "./graph.js";
import type {
  CandidateMechanism,
  CollisionHit,
  CollisionReport,
} from "./types.js";
import type { NoveltyNode } from "./types.js";

function stringProperty(
  node: NoveltyNode,
  key: string,
): string | undefined {
  const value = node.properties?.[key];
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function priorFromNode(
  node: NoveltyNode,
): CandidateMechanism & { label: string } {
  return {
    mechanism: stringProperty(node, "mechanism") ?? "",
    interface: stringProperty(node, "interface") ?? "",
    host: stringProperty(node, "host") ?? "",
    readout: stringProperty(node, "readout") ?? "",
    substrate: stringProperty(node, "substrate"),
    sequence_hash: stringProperty(node, "sequence_hash"),
    label: node.label,
  };
}

export function findCollisions(
  candidate: CandidateMechanism,
  graph: NoveltyGraph,
): CollisionHit[] {
  const tuple = canonicalize(candidate);
  const hits: CollisionHit[] = [];

  for (const node of graph.nodes("project")) {
    const prior = priorFromNode(node);
    if (prior.mechanism === "") continue;
    const priorTuple = canonicalize(prior);

    if (
      candidate.sequence_hash &&
      prior.sequence_hash &&
      candidate.sequence_hash === prior.sequence_hash
    ) {
      hits.push({
        kind: "sequence",
        prior_id: node.id,
        prior_label: node.label,
        severity: "high",
        note: "sequence-level collision; treat it as the same part",
        matched: ["sequence"],
      });
      continue;
    }

    const sameMechanism = tuple.mechanism === priorTuple.mechanism;
    if (!sameMechanism) continue;

    const sameInterface =
      tuple.interface === priorTuple.interface &&
      tuple.host === priorTuple.host &&
      tuple.readout === priorTuple.readout &&
      tuple.substrate === priorTuple.substrate;

    const matched = ["mechanism"];
    if (sameInterface) matched.push("interface");
    if (tuple.host !== priorTuple.host) matched.push("host");
    if (tuple.readout !== priorTuple.readout) matched.push("readout");
    if (tuple.substrate !== priorTuple.substrate) matched.push("substrate");

    if (sameInterface) {
      hits.push({
        kind: "mechanism",
        prior_id: node.id,
        prior_label: node.label,
        severity: "high",
        note: "mechanism and interface collide",
        matched,
      });
    } else {
      hits.push({
        kind: "interface",
        prior_id: node.id,
        prior_label: node.label,
        severity: "medium",
        note: "mechanism collides; the interface differs",
        matched,
      });
    }
  }

  return hits;
}

export function collisionReport(
  candidate: CandidateMechanism,
  graph: NoveltyGraph,
): CollisionReport {
  const hits = findCollisions(candidate, graph);
  const mechanism = hits.filter((hit) => hit.kind === "mechanism").length;
  const sequence = hits.filter((hit) => hit.kind === "sequence").length;
  const iface = hits.filter((hit) => hit.kind === "interface").length;
  const verdict =
    mechanism > 0 || sequence > 0
      ? "blocked"
      : iface > 0
        ? "interface"
        : "novel";
  const noveltyArgument =
    verdict === "blocked"
      ? "The mechanism and interface collide with prior work; change the mechanism or kill it."
      : verdict === "interface"
        ? "The mechanism is known; argue novelty in the interface (host, readout, sample or quantification)."
        : "No mechanism or interface collision was found in the indexed prior art; confirm the corpus covers the domain.";

  return {
    candidate,
    hits,
    mechanism_collisions: mechanism,
    interface_whitespace: iface,
    sequence_collisions: sequence,
    verdict,
    novelty_argument: noveltyArgument,
  };
}
