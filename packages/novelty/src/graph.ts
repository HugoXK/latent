import type {
  NoveltyEdge,
  NoveltyEdgeKind,
  NoveltyNode,
  NoveltyNodeKind,
} from "./types.js";

export class NoveltyGraph {
  readonly #nodes = new Map<string, NoveltyNode>();
  readonly #edges: NoveltyEdge[] = [];

  addNode(node: NoveltyNode): NoveltyNode {
    if (this.#nodes.has(node.id)) {
      throw new Error(`duplicate novelty node ${node.id}`);
    }
    this.#nodes.set(node.id, node);
    return node;
  }

  addProject(
    id: string,
    label: string,
    properties: Record<string, unknown> = {},
  ): NoveltyNode {
    return this.addNode({ id, kind: "project", label, properties });
  }

  addEdge(edge: NoveltyEdge): void {
    if (!this.#nodes.has(edge.from) || !this.#nodes.has(edge.to)) {
      throw new Error(
        `novelty edge references a missing node: ${edge.from} -> ${edge.to}`,
      );
    }
    this.#edges.push(edge);
  }

  node(id: string): NoveltyNode | null {
    return this.#nodes.get(id) ?? null;
  }

  nodes(kind?: NoveltyNodeKind): NoveltyNode[] {
    return [...this.#nodes.values()].filter(
      (node) => kind === undefined || node.kind === kind,
    );
  }

  edges(from?: string): NoveltyEdge[] {
    return this.#edges.filter((edge) => from === undefined || edge.from === from);
  }

  neighbors(id: string, kind?: NoveltyEdgeKind): NoveltyNode[] {
    const result: NoveltyNode[] = [];
    for (const edge of this.#edges) {
      if (edge.from !== id) continue;
      if (kind !== undefined && edge.kind !== kind) continue;
      const node = this.#nodes.get(edge.to);
      if (node) result.push(node);
    }
    return result;
  }
}
