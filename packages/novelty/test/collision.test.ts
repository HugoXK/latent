import test from "node:test";
import assert from "node:assert/strict";
import {
  NoveltyGraph,
  collisionReport,
  renderCollisionMarkdown,
  toBriefCollisions,
} from "../src/index.js";
import type { CandidateMechanism } from "../src/index.js";

const graph = new NoveltyGraph();
graph.addProject("pa_arsenic", "Arsenic whole-cell biosensor", {
  mechanism: "arsenic-responsive repressor",
  interface: "whole-cell fluorescence",
  host: "E. coli",
  readout: "fluorescence",
});

const candidate: CandidateMechanism = {
  mechanism: "arsenic-responsive repressor",
  interface: "whole-cell fluorescence",
  host: "Bacillus subtilis",
  readout: "colorimetric",
};

test("a known mechanism with a new interface is interface whitespace", () => {
  const report = collisionReport(candidate, graph);
  assert.equal(report.verdict, "interface");
  assert.equal(report.interface_whitespace, 1);
  assert.equal(report.mechanism_collisions, 0);
  assert.ok(report.hits[0]?.matched.includes("host"));
  assert.match(renderCollisionMarkdown(report), /Novelty and collisions/);
});

test("the same mechanism and interface is blocked", () => {
  const report = collisionReport(
    { ...candidate, host: "E. coli", readout: "fluorescence" },
    graph,
  );
  assert.equal(report.verdict, "blocked");
  assert.equal(report.mechanism_collisions, 1);
});

test("a different mechanism is novel", () => {
  const report = collisionReport(
    { ...candidate, mechanism: "RNA thermosensor" },
    graph,
  );
  assert.equal(report.verdict, "novel");
  assert.equal(report.hits.length, 0);
});

test("a sequence hash collision is a high-severity hit", () => {
  const withSequence = new NoveltyGraph();
  withSequence.addProject("pa_seq", "Sequence donor", {
    mechanism: "other",
    sequence_hash: "abc123",
  });
  const report = collisionReport(
    { ...candidate, mechanism: "RNA thermosensor", sequence_hash: "abc123" },
    withSequence,
  );
  assert.equal(report.sequence_collisions, 1);
  assert.equal(report.verdict, "blocked");
  assert.equal(report.hits[0]?.severity, "high");
});

test("a collision report maps into the structured brief field", () => {
  const report = collisionReport(candidate, graph);
  const collisions = toBriefCollisions(report);
  assert.equal(collisions.length, 1);
  assert.equal(collisions[0]?.prior_id, "pa_arsenic");
  assert.equal(collisions[0]?.kind, "interface");
});
