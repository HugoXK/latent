import test from "node:test";
import assert from "node:assert/strict";
import { NoveltyGraph } from "../src/index.js";

test("a graph stores typed nodes and edges", () => {
  const graph = new NoveltyGraph();
  graph.addProject("pa_arsenic", "Arsenic biosensor", {
    mechanism: "arsenic-responsive repressor",
  });
  graph.addNode({
    id: "mech_arsenic",
    kind: "mechanism",
    label: "Arsenic repressor",
  });
  graph.addEdge({ from: "pa_arsenic", to: "mech_arsenic", kind: "uses" });

  assert.equal(graph.nodes("project").length, 1);
  assert.equal(graph.node("mech_arsenic")?.kind, "mechanism");
  assert.equal(graph.edges("pa_arsenic").length, 1);
  assert.deepEqual(
    graph.neighbors("pa_arsenic", "uses").map((node) => node.id),
    ["mech_arsenic"],
  );
});

test("duplicate nodes and dangling edges are rejected", () => {
  const graph = new NoveltyGraph();
  graph.addProject("pa_1", "One");
  assert.throws(() => graph.addProject("pa_1", "Again"));
  assert.throws(() =>
    graph.addEdge({ from: "pa_1", to: "missing", kind: "uses" }),
  );
});
