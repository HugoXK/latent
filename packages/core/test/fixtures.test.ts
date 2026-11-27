import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SchemaValidationError, assertValid } from "../src/index.js";
import type { SchemaName } from "../src/index.js";

const SCHEMA_DIR = fileURLToPath(
  new URL("../../../data/schemas/", import.meta.url),
);
const FIXTURE_DIR = fileURLToPath(
  new URL("../../../data/fixtures/", import.meta.url),
);
const REPLAY_VALID = fileURLToPath(
  new URL(
    "../../../data/replay/fixtures/valid/igem-illustrative-001.json",
    import.meta.url,
  ),
);
const REPLAY_INVALID = fileURLToPath(
  new URL(
    "../../../data/replay/fixtures/invalid/missing-outcome.json",
    import.meta.url,
  ),
);

// The file key is not always the schema name: `constraint-state` is the
// `constraint` validator, and `replay-case` is `replayCase`. A new schema without
// an entry here fails the test, which is the point.
const NAMES: Record<string, string> = {
  fragment: "fragment",
  "constraint-state": "constraint",
  claim: "claim",
  idea: "idea",
  gate: "gate",
  brief: "brief",
  edge: "edge",
  outcome: "outcome",
  "replay-case": "replayCase",
};

function load(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

test("every schema has a valid and an invalid fixture", () => {
  const schemas = readdirSync(SCHEMA_DIR)
    .filter((name) => name.endsWith(".schema.json"))
    .sort();
  assert.ok(schemas.length >= 6, "expected the core schemas");

  for (const file of schemas) {
    const key = file.replace(/\.schema\.json$/, "");
    const name = NAMES[key];
    assert.ok(name, `add a fixture mapping for ${key}`);

    const validPath =
      key === "replay-case" ? REPLAY_VALID : `${FIXTURE_DIR}/${key}/valid.json`;
    const invalidPath =
      key === "replay-case"
        ? REPLAY_INVALID
        : `${FIXTURE_DIR}/${key}/invalid.json`;

    assert.doesNotThrow(
      () => assertValid(name as SchemaName, load(validPath)),
      `${key}: valid fixture must pass`,
    );
    assert.throws(
      () => assertValid(name as SchemaName, load(invalidPath)),
      SchemaValidationError,
      `${key}: invalid fixture must fail`,
    );
  }
});
