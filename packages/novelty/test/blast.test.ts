import test from "node:test";
import assert from "node:assert/strict";
import {
  BlastPlusAdapter,
  CachedBlastProvider,
  highConfidenceHits,
  parseBlastTabular,
} from "../src/index.js";
import type { BlastProvider, BlastRunner } from "../src/index.js";

const OUTPUT = [
  "q\tBBa_B0034\t99.5\t500\t500\t500\t0.0\t1000\tArsenic part",
  "q\tBBa_E0040\t70.0\t350\t500\t500\t1e-10\t400\tGFP",
  "",
].join("\n");

test("tabular BLAST output is parsed into identity and coverage", () => {
  const hits = parseBlastTabular(OUTPUT);
  assert.equal(hits.length, 2);
  assert.equal(hits[0]?.part_id, "BBa_B0034");
  assert.ok(Math.abs((hits[0]?.identity ?? 0) - 0.995) < 1e-9);
  assert.equal(hits[0]?.coverage, 1);
  assert.equal(hits[1]?.identity, 0.7);
});

test("the BLAST+ adapter uses the runner and the database", async () => {
  const calls: string[][] = [];
  const runner: BlastRunner = {
    async run(args) {
      calls.push(args);
      return OUTPUT;
    },
  };
  const adapter = new BlastPlusAdapter(runner, "/tmp/parts");
  const hits = await adapter.search("ACGT");
  assert.equal(hits.length, 2);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.[0], "blastn");
  assert.ok(calls[0]?.includes("-db"));
  assert.ok(calls[0]?.includes("/tmp/parts"));
});

test("the cache calls the provider once per sequence", async () => {
  let calls = 0;
  const inner: BlastProvider = {
    async search() {
      calls += 1;
      return parseBlastTabular(OUTPUT);
    },
  };
  const cached = new CachedBlastProvider(inner);
  await cached.search("ACGT");
  await cached.search("ACGT");
  await cached.search("TGCA");
  assert.equal(calls, 2);
});

test("high-confidence hits filter weak matches", () => {
  const hits = highConfidenceHits(parseBlastTabular(OUTPUT));
  assert.equal(hits.length, 1);
  assert.equal(hits[0]?.part_id, "BBa_B0034");
});
