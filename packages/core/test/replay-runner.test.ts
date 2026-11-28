import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  renderReplayMarkdown,
  runReplayCase,
} from "../src/index.js";
import type {
  ReconstructOutput,
  Reconstructor,
  ReplayCase,
  ReplayCollisionDetector,
  ReplayGatePredictor,
  VerticalPack,
} from "../src/index.js";

const replay = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL(
        "../../../data/replay/fixtures/valid/igem-illustrative-001.json",
        import.meta.url,
      ),
    ),
    "utf8",
  ),
) as ReplayCase;

const vertical: VerticalPack = {
  id: "igem",
  name: "test pack",
  variables: [],
  questions: [],
  gates: [
    {
      key: "readout",
      name: "measurable readout",
      criteria: "dose response",
      falsifier: "no response",
      fallback: "change_readout",
      hard: true,
    },
  ],
  briefTemplate: "test",
};

const seed = replay.expected_candidates.find((candidate) => candidate.is_seed);

if (!seed) throw new Error("the fixture needs a seed candidate");

class FakeReconstructor implements Reconstructor {
  constructor(private readonly statement: string) {}

  async reconstruct(): Promise<ReconstructOutput> {
    return {
      title: "synthetic",
      one_liner: "synthetic",
      hypotheses: [
        {
          variant: "conservative",
          statement: this.statement,
          confidence: 0.4,
          confidence_basis: "C",
        },
        {
          variant: "ambitious",
          statement: this.statement,
          confidence: 0.3,
          confidence_basis: "C",
        },
        {
          variant: "cross_domain",
          statement: this.statement,
          confidence: 0.2,
          confidence_basis: "C",
        },
      ],
      assumptions: [{ statement: "a", risk: "high" }],
      claims: [
        {
          text: "c",
          status: "unknown",
          confidence: 0.2,
          confidence_basis: "C",
        },
      ],
      open_questions: [],
    };
  }
}

test("a reconstructor that recovers the seed passes", async () => {
  const result = await runReplayCase({
    case: replay,
    vertical,
    reconstructor: new FakeReconstructor(seed.statement),
    now: "2026-11-25T00:00:00Z",
  });
  assert.equal(result.candidate.seed_found, true);
  assert.equal(result.candidate.variant_coverage, 1);
  assert.equal(result.claims.unsupported, 0);
  assert.equal(result.passed, true);
});

test("a reconstructor that misses the seed fails", async () => {
  const result = await runReplayCase({
    case: replay,
    vertical,
    reconstructor: new FakeReconstructor("unrelated words about the weather"),
    now: "2026-11-25T00:00:00Z",
  });
  assert.equal(result.candidate.seed_found, false);
  assert.equal(result.passed, false);
});

const answers = Object.fromEntries(
  replay.gate_labels.map((label) => [label.gate, label.expected]),
) as Record<string, "pass" | "fail" | "unknown">;

test("gate agreement is measured when a predictor is supplied", async () => {
  const predictor: ReplayGatePredictor = {
    async predict() {
      return answers;
    },
  };
  const result = await runReplayCase({
    case: replay,
    vertical,
    reconstructor: new FakeReconstructor(seed.statement),
    gatePredictor: predictor,
    now: "2026-11-25T00:00:00Z",
  });
  assert.equal(result.gate.available, true);
  assert.equal(result.gate.compared, replay.gate_labels.length);
  assert.equal(result.gate.agreement, 1);
});

test("a wrong gate predictor lowers agreement", async () => {
  const predictor: ReplayGatePredictor = {
    async predict() {
      return Object.fromEntries(
        replay.gate_labels.map((label) => [label.gate, "fail" as const]),
      );
    },
  };
  const result = await runReplayCase({
    case: replay,
    vertical,
    reconstructor: new FakeReconstructor(seed.statement),
    gatePredictor: predictor,
    now: "2026-11-25T00:00:00Z",
  });
  assert.ok((result.gate.agreement ?? 1) < 1);
});

test("collision precision and recall are measured when a detector is supplied", async () => {
  const detector: ReplayCollisionDetector = {
    async detect() {
      return replay.collisions;
    },
  };
  const hit = await runReplayCase({
    case: replay,
    vertical,
    reconstructor: new FakeReconstructor(seed.statement),
    collisionDetector: detector,
    now: "2026-11-25T00:00:00Z",
  });
  assert.equal(hit.collision.precision, 1);
  assert.equal(hit.collision.recall, 1);

  const empty: ReplayCollisionDetector = {
    async detect() {
      return [];
    },
  };
  const miss = await runReplayCase({
    case: replay,
    vertical,
    reconstructor: new FakeReconstructor(seed.statement),
    collisionDetector: empty,
    now: "2026-11-25T00:00:00Z",
  });
  assert.equal(miss.collision.precision, 1);
  assert.equal(miss.collision.recall, 0);
});

test("plugins receive a public case without the answer key", async () => {
  let gateLeak = true;
  let collisionLeak = true;
  const predictor: ReplayGatePredictor = {
    async predict({ case: publicCase }) {
      gateLeak =
        "gate_labels" in publicCase ||
        "expected_candidates" in publicCase ||
        "outcome" in publicCase;
      return {};
    },
  };
  const detector: ReplayCollisionDetector = {
    async detect({ case: publicCase }) {
      collisionLeak = "collisions" in publicCase;
      return [];
    },
  };
  const result = await runReplayCase({
    case: replay,
    vertical,
    reconstructor: new FakeReconstructor(seed.statement),
    gatePredictor: predictor,
    collisionDetector: detector,
    now: "2026-11-25T00:00:00Z",
  });
  assert.equal(gateLeak, false);
  assert.equal(collisionLeak, false);
  assert.equal(result.gate.compared, 0);
  assert.equal(result.gate.agreement, null);
});

test("a predictor that echoes a leaked answer key scores nothing", async () => {
  const predictor: ReplayGatePredictor = {
    async predict({ case: publicCase }) {
      const leaked = (
        publicCase as unknown as {
          gate_labels?: Array<{ gate: string; expected: "pass" | "fail" | "unknown" }>;
        }
      ).gate_labels;
      return Object.fromEntries(
        (leaked ?? []).map((label) => [label.gate, label.expected]),
      );
    },
  };
  const result = await runReplayCase({
    case: replay,
    vertical,
    reconstructor: new FakeReconstructor(seed.statement),
    gatePredictor: predictor,
    now: "2026-11-25T00:00:00Z",
  });
  assert.equal(result.gate.compared, 0);
  assert.equal(result.gate.agreement, null);
});

test("the markdown report names the case and the metrics", async () => {
  const result = await runReplayCase({
    case: replay,
    vertical,
    reconstructor: new FakeReconstructor(seed.statement),
    now: "2026-11-25T00:00:00Z",
  });
  const markdown = renderReplayMarkdown(result);
  assert.match(markdown, /# Replay replay_igem-illustrative-001/);
  assert.match(markdown, /seed found: true/);
});
