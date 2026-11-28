import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderSchemaTypes } from "../../../scripts/generate-schema-types.js";

const COMMITTED = fileURLToPath(
  new URL("../src/generated/schemas.ts", import.meta.url),
);

test("the committed schema types match a fresh generation", () => {
  const fresh = renderSchemaTypes();
  const committed = readFileSync(COMMITTED, "utf8");
  if (fresh === committed) return;

  const expected = fresh.split("\n");
  const actual = committed.split("\n");
  const at = expected.findIndex((line, index) => line !== actual[index]);
  assert.fail(
    `generated schema types are stale at line ${at + 1}: expected ${JSON.stringify(
      expected[at] ?? "<eof>",
    )}, found ${JSON.stringify(actual[at] ?? "<eof>")}; run \`pnpm schema:types\``,
  );
});
