import test from "node:test";
import assert from "node:assert/strict";
import {
  collisionReport,
  graphFromPriorArt,
  priorArtSourceUrls,
  toBriefCollisions,
} from "../src/index.js";
import type { PriorArtEntry } from "../src/index.js";

const priorArt: PriorArtEntry[] = [
  {
    id: "pa_1",
    label: "A prior whole-cell biosensor",
    mechanism: "arsenic-responsive repressor",
    interface: "whole-cell fluorescence",
    host: "E. coli",
    readout: "fluorescence",
    url: "https://example.org/pa_1",
  },
];

test("a prior-art list becomes a collision report with evidence links", () => {
  const report = collisionReport(
    {
      mechanism: "arsenic-responsive repressor",
      interface: "whole-cell fluorescence",
      host: "E. coli",
      readout: "fluorescence",
    },
    graphFromPriorArt(priorArt),
  );
  assert.equal(report.verdict, "blocked");

  const collisions = toBriefCollisions(report, {
    sourceUrls: priorArtSourceUrls(priorArt),
    claimIds: ["clm_1", "clm_2"],
  });
  assert.equal(collisions.length, 1);
  assert.equal(collisions[0]?.kind, "mechanism");
  assert.equal(collisions[0]?.source_url, "https://example.org/pa_1");
  assert.deepEqual(collisions[0]?.claim_ids, ["clm_1", "clm_2"]);
});

test("a clean prior-art list is checked, not silently clean", () => {
  const report = collisionReport(
    {
      mechanism: "a different mechanism",
      interface: "a different interface",
      host: "a different host",
      readout: "a different readout",
    },
    graphFromPriorArt(priorArt),
  );
  assert.equal(report.verdict, "novel");
  assert.deepEqual(toBriefCollisions(report, {}), []);
});
