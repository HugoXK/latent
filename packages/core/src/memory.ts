import { newId } from "./ids.js";
import type {
  Idea,
  MemoryEdge,
  MemoryNodeRef,
  MemoryRelation,
} from "./types.js";

/** The relation vocabulary is closed. An unknown relation is not a silent label. */
export const MEMORY_RELATIONS: readonly MemoryRelation[] = [
  "derived_from",
  "references",
  "supports",
  "contradicts",
  "supersedes",
  "duplicates",
  "collided_with",
  "outcome_of",
];

export class MemoryEdgeError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "MemoryEdgeError";
    this.code = code;
  }
}

export interface CreateEdgeInput {
  id?: string;
  owner_id: string;
  from: MemoryNodeRef;
  to: MemoryNodeRef;
  relation: MemoryRelation;
  weight?: number;
  provenance: string;
}

function nodeKey(ref: MemoryNodeRef): string {
  return `${ref.type}:${ref.id}`;
}

function assertNode(ref: MemoryNodeRef, label: "from" | "to"): void {
  if (!ref || typeof ref.id !== "string" || ref.id.trim() === "") {
    throw new MemoryEdgeError(
      "NODE_REQUIRED",
      `The ${label} node needs a non-empty id.`,
    );
  }
}

/**
 * Build one typed edge. The caller supplies the clock so a replay is
 * deterministic; the id may be supplied for imports and fixtures.
 */
export function createEdge(
  input: CreateEdgeInput,
  now = new Date().toISOString(),
): MemoryEdge {
  const owner = input.owner_id.trim();
  if (owner === "") {
    throw new MemoryEdgeError("OWNER_REQUIRED", "An edge needs an owner_id.");
  }
  assertNode(input.from, "from");
  assertNode(input.to, "to");
  if (nodeKey(input.from) === nodeKey(input.to)) {
    throw new MemoryEdgeError(
      "SELF_EDGE",
      "An edge cannot connect a node to itself.",
    );
  }
  if (!MEMORY_RELATIONS.includes(input.relation)) {
    throw new MemoryEdgeError(
      "UNKNOWN_RELATION",
      `Unknown memory relation: ${String(input.relation)}`,
    );
  }
  const provenance = input.provenance.trim();
  if (provenance === "") {
    throw new MemoryEdgeError(
      "PROVENANCE_REQUIRED",
      "An edge needs provenance; an unexplained connection is not allowed.",
    );
  }
  const weight = input.weight ?? 1;
  if (!Number.isFinite(weight) || weight < 0 || weight > 1) {
    throw new MemoryEdgeError(
      "WEIGHT_OUT_OF_RANGE",
      "Edge weight must be a finite number between 0 and 1.",
    );
  }

  return {
    id: input.id ?? newId("edg"),
    owner_id: owner,
    from: { type: input.from.type, id: input.from.id },
    to: { type: input.to.type, id: input.to.id },
    relation: input.relation,
    weight,
    provenance,
    created_at: now,
    deleted_at: null,
    schema_version: "1.0.0",
  };
}

export function isLiveEdge(edge: MemoryEdge): boolean {
  return !edge.deleted_at;
}

export interface ConnectionStep {
  edge: MemoryEdge;
  direction: "forward" | "backward";
}

export interface ConnectionResult {
  from: MemoryNodeRef;
  to: MemoryNodeRef;
  found: boolean;
  depth: number;
  path: ConnectionStep[];
}

interface Neighbor {
  key: string;
  step: ConnectionStep;
}

function addNeighbor(
  graph: Map<string, Neighbor[]>,
  key: string,
  neighbor: Neighbor,
): void {
  const list = graph.get(key);
  if (list) list.push(neighbor);
  else graph.set(key, [neighbor]);
}

/**
 * Explain why two nodes are connected. The graph is treated as undirected for
 * the path, but each step keeps the original edge direction. Edges are sorted by
 * id so the same input always returns the same path.
 */
export function explainConnection(
  edges: MemoryEdge[],
  from: MemoryNodeRef,
  to: MemoryNodeRef,
  maxDepth = 3,
): ConnectionResult {
  const fromKey = nodeKey(from);
  const toKey = nodeKey(to);
  if (fromKey === toKey) {
    return { from, to, found: true, depth: 0, path: [] };
  }

  const depthLimit = Math.max(1, Math.min(5, Math.trunc(maxDepth)));
  const graph = new Map<string, Neighbor[]>();
  const live = edges
    .filter(isLiveEdge)
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id));

  for (const edge of live) {
    const fromSide = nodeKey(edge.from);
    const toSide = nodeKey(edge.to);
    addNeighbor(graph, fromSide, {
      key: toSide,
      step: { edge, direction: "forward" },
    });
    addNeighbor(graph, toSide, {
      key: fromSide,
      step: { edge, direction: "backward" },
    });
  }

  const visited = new Set<string>([fromKey]);
  let frontier: Array<{ key: string; path: ConnectionStep[] }> = [
    { key: fromKey, path: [] },
  ];

  for (let depth = 1; depth <= depthLimit; depth += 1) {
    const next: Array<{ key: string; path: ConnectionStep[] }> = [];
    for (const current of frontier) {
      for (const neighbor of graph.get(current.key) ?? []) {
        if (visited.has(neighbor.key)) continue;
        const path = [...current.path, neighbor.step];
        if (neighbor.key === toKey) {
          return { from, to, found: true, depth, path };
        }
        visited.add(neighbor.key);
        next.push({ key: neighbor.key, path });
      }
    }
    frontier = next;
    if (frontier.length === 0) break;
  }

  return { from, to, found: false, depth: 0, path: [] };
}

/**
 * The edges that a successful develop run creates. They are proposals with
 * provenance, not a claim that the idea is correct.
 */
export function developEdges(input: {
  idea: Idea;
  fragmentId?: string;
  ownerId?: string;
  now?: string;
}): MemoryEdge[] {
  const ownerId = input.ownerId ?? "local";
  const now = input.now ?? new Date().toISOString();
  const edges: MemoryEdge[] = [];
  if (input.fragmentId) {
    edges.push(
      createEdge(
        {
          owner_id: ownerId,
          from: { type: "fragment", id: input.fragmentId },
          to: { type: "idea", id: input.idea.id },
          relation: "derived_from",
          provenance: "develop",
        },
        now,
      ),
    );
  }
  for (const claimId of input.idea.claims) {
    edges.push(
      createEdge(
        {
          owner_id: ownerId,
          from: { type: "idea", id: input.idea.id },
          to: { type: "claim", id: claimId },
          relation: "references",
          provenance: "develop",
        },
        now,
      ),
    );
  }
  for (const gateId of input.idea.gate_ids ?? []) {
    edges.push(
      createEdge(
        {
          owner_id: ownerId,
          from: { type: "idea", id: input.idea.id },
          to: { type: "gate", id: gateId },
          relation: "references",
          provenance: "develop",
        },
        now,
      ),
    );
  }
  return edges;
}
