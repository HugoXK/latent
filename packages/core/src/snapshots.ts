import { createHash } from "node:crypto";
import type { SourceSnapshot as GeneratedSourceSnapshot } from "./generated/schemas.js";
import type { Source } from "./types.js";

export type ContentSnapshot = GeneratedSourceSnapshot;

export function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export function createSnapshot(input: {
  content: string;
  url: string;
  title?: string | null;
  fetched_at?: string;
  content_type?: string | null;
}): ContentSnapshot {
  return {
    hash: hashContent(input.content),
    content: input.content,
    url: input.url,
    title: input.title ?? null,
    fetched_at: input.fetched_at ?? new Date().toISOString(),
    content_type: input.content_type ?? null,
    schema_version: "1.0.0",
  };
}

/**
 * A content-addressed store. The same content is stored once, whatever URL it
 * came from; a source points at the hash, not at a mutable page.
 */
export class SnapshotStore {
  readonly #items = new Map<string, ContentSnapshot>();

  put(snapshot: ContentSnapshot): ContentSnapshot {
    const existing = this.#items.get(snapshot.hash);
    if (existing) return existing;
    this.#items.set(snapshot.hash, snapshot);
    return snapshot;
  }

  get(hash: string): ContentSnapshot | null {
    return this.#items.get(hash) ?? null;
  }

  has(hash: string): boolean {
    return this.#items.has(hash);
  }

  get size(): number {
    return this.#items.size;
  }
}

export function withSnapshot(source: Source, snapshot: ContentSnapshot): Source {
  return { ...source, snapshot_hash: snapshot.hash };
}
