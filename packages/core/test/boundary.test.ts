import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SchemaValidationError, assertValid } from "../src/index.js";
import type { SchemaName } from "../src/index.js";

const SCHEMAS = fileURLToPath(new URL("../../../data/schemas/", import.meta.url));
const FIXTURES = fileURLToPath(
  new URL("../../../data/fixtures/", import.meta.url),
);
const REPLAY = fileURLToPath(
  new URL(
    "../../../data/replay/fixtures/valid/igem-illustrative-001.json",
    import.meta.url,
  ),
);

function fixture(name: string): any {
  return JSON.parse(readFileSync(`${FIXTURES}/${name}`, "utf8")) as any;
}

function replay(): any {
  return JSON.parse(readFileSync(REPLAY, "utf8")) as any;
}

function rejects(schema: SchemaName, value: unknown): void {
  assert.throws(() => assertValid(schema, value), SchemaValidationError);
}

/**
 * One boundary case per schema. The coverage test below fails when a schema file
 * is added without a case here, so a new field cannot ship unexercised.
 */
const CASES: Record<SchemaName, () => void> = {
  fragment: () => {
    const empty = fixture("fragment/valid.json");
    empty.content = "";
    rejects("fragment", empty);
    const kind = fixture("fragment/valid.json");
    kind.kind = "audio";
    rejects("fragment", kind);
  },
  claim: () => {
    const confidence = fixture("claim/valid.json");
    confidence.confidence = 1.5;
    rejects("claim", confidence);
    const status = fixture("claim/valid.json");
    status.status = "maybe";
    rejects("claim", status);
  },
  idea: () => {
    const hypotheses = fixture("idea/valid.json");
    hypotheses.hypotheses = [];
    rejects("idea", hypotheses);
    const confidence = fixture("idea/valid.json");
    confidence.hypotheses[0].confidence = 2;
    rejects("idea", confidence);
  },
  gate: () => {
    const falsifier = fixture("gate/valid.json");
    falsifier.falsifier = "";
    rejects("gate", falsifier);
    const fallback = fixture("gate/valid.json");
    fallback.fallback = "other";
    rejects("gate", fallback);
  },
  brief: () => {
    const unknowns = fixture("brief/valid.json");
    unknowns.unknowns = [];
    rejects("brief", unknowns);
    const steps = fixture("brief/valid.json");
    steps.next_steps = [];
    rejects("brief", steps);
    const collisionSource = fixture("brief/valid.json");
    collisionSource.collisions[0].source_url = 42;
    rejects("brief", collisionSource);
    const checkStatus = fixture("brief/valid.json");
    checkStatus.collision_check.status = "maybe";
    rejects("brief", checkStatus);
  },
  constraint: () => {
    const version = fixture("constraint-state/valid.json");
    version.version = 0;
    rejects("constraint", version);
    const confidence = fixture("constraint-state/valid.json");
    confidence.variables["lab.bsl"].confidence = 2;
    rejects("constraint", confidence);
  },
  edge: () => {
    const weight = fixture("edge/valid.json");
    weight.weight = 2;
    rejects("edge", weight);
    const provenance = fixture("edge/valid.json");
    provenance.provenance = "";
    rejects("edge", provenance);
  },
  replayCase: () => {
    const candidates = replay();
    candidates.expected_candidates = [];
    rejects("replayCase", candidates);
    const season = replay();
    season.metadata.season = 2002;
    rejects("replayCase", season);
  },
};

const KEY_BY_FILE: Record<string, SchemaName> = {
  "fragment.schema.json": "fragment",
  "constraint-state.schema.json": "constraint",
  "claim.schema.json": "claim",
  "idea.schema.json": "idea",
  "gate.schema.json": "gate",
  "brief.schema.json": "brief",
  "edge.schema.json": "edge",
  "replay-case.schema.json": "replayCase",
};

test("every schema rejects a boundary violation", () => {
  for (const [schema, run] of Object.entries(CASES)) {
    assert.doesNotThrow(run, `boundary case failed for ${schema}`);
  }
});

test("every schema file has a boundary case", () => {
  const files = readdirSync(SCHEMAS).filter((file) =>
    file.endsWith(".schema.json"),
  );
  assert.ok(files.length > 0);
  for (const file of files) {
    const key = KEY_BY_FILE[file];
    assert.ok(key, `schema ${file} is not mapped to a SchemaName`);
    assert.equal(
      typeof CASES[key],
      "function",
      `schema ${file} has no boundary case in this test`,
    );
  }
});
