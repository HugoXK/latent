import test from "node:test";
import assert from "node:assert/strict";
import { isVerticalId, listVerticals, verticalById } from "../src/index.js";

test("the registry exposes both packs and rejects an unknown id", () => {
  assert.deepEqual(listVerticals().map((pack) => pack.id).sort(), [
    "igem",
    "research",
  ]);
  assert.equal(verticalById("research").id, "research");
  assert.equal(isVerticalId("igem"), true);
  assert.equal(isVerticalId("nope"), false);
  assert.throws(() => verticalById("nope"), /unknown vertical/);
});
