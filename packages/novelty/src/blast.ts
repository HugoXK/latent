import { createHash } from "node:crypto";

export interface SequenceHit {
  part_id: string;
  identity: number;
  coverage: number;
  evalue: number;
  description: string;
}

export interface BlastProvider {
  search(sequence: string): Promise<SequenceHit[]>;
}

/**
 * The process port. A real implementation runs `blastn` against a local
 * database; tests inject a fake and make no process or network call.
 */
export interface BlastRunner {
  run(args: string[], input: string): Promise<string>;
}

export function parseBlastTabular(output: string): SequenceHit[] {
  const hits: SequenceHit[] = [];
  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    const fields = line.split("\t");
    if (fields.length < 9) continue;
    const identity = Number(fields[2]) / 100;
    const length = Number(fields[3]);
    const qlen = Number(fields[4]);
    const evalue = Number(fields[6]);
    if (
      !Number.isFinite(identity) ||
      !Number.isFinite(length) ||
      !Number.isFinite(qlen)
    ) {
      continue;
    }
    hits.push({
      part_id: fields[1] ?? "",
      identity,
      coverage: qlen > 0 ? length / qlen : 0,
      evalue: Number.isFinite(evalue) ? evalue : Number.POSITIVE_INFINITY,
      description: fields[8] ?? "",
    });
  }
  return hits;
}

const OUTFORMAT =
  "6 qseqid sseqid pident length qlen slen evalue bitscore stitle";

export class BlastPlusAdapter implements BlastProvider {
  constructor(
    private readonly runner: BlastRunner,
    private readonly databasePath: string,
  ) {}

  async search(sequence: string): Promise<SequenceHit[]> {
    const output = await this.runner.run(
      ["blastn", "-db", this.databasePath, "-outfmt", OUTFORMAT],
      sequence,
    );
    return parseBlastTabular(output);
  }
}

export class CachedBlastProvider implements BlastProvider {
  readonly #inner: BlastProvider;
  readonly #cache = new Map<string, SequenceHit[]>();

  constructor(inner: BlastProvider) {
    this.#inner = inner;
  }

  async search(sequence: string): Promise<SequenceHit[]> {
    const key = createHash("sha256").update(sequence).digest("hex");
    const cached = this.#cache.get(key);
    if (cached) return cached;
    const hits = await this.#inner.search(sequence);
    this.#cache.set(key, hits);
    return hits;
  }
}

export interface BlastThresholds {
  identity?: number;
  coverage?: number;
}

export function highConfidenceHits(
  hits: SequenceHit[],
  thresholds: BlastThresholds = {},
): SequenceHit[] {
  const identity = thresholds.identity ?? 0.9;
  const coverage = thresholds.coverage ?? 0.9;
  return hits.filter(
    (hit) => hit.identity >= identity && hit.coverage >= coverage,
  );
}
