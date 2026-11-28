import test from "node:test";
import assert from "node:assert/strict";
import {
  diffBriefs,
  escapeHtml,
  exportBriefHtml,
  exportBriefJson,
  renderBriefDiffMarkdown,
} from "../src/index.js";
import type { Brief } from "../src/index.js";

function brief(overrides: Partial<Brief> = {}): Brief {
  return {
    id: "brf_test0001",
    idea_id: "idea_test0001",
    idea_version: 1,
    one_liner: "<script>alert(1)</script>",
    problem: { text: "p" },
    approach: { text: "a" },
    evidence: ["clm_1"],
    risks: [{ risk: "r", trigger: "t", fallback: "reduce_scope" }],
    collisions: [
      {
        kind: "interface",
        prior_id: "pa_1",
        prior_label: "Prior",
        severity: "medium",
        note: "n",
      },
    ],
    sections: [{ title: "Components", text: "x" }],
    next_steps: ["n"],
    unknowns: ["u"],
    validators: [],
    compiled_at: "2026-11-25T00:00:00Z",
    ...overrides,
  };
}

test("HTML escapes user content and renders every section", () => {
  const html = exportBriefHtml(brief());
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /<h2>Components<\/h2>/);
  assert.match(html, /Novelty and collisions/);
  assert.match(html, /<!doctype html>/);
});

test("escapeHtml covers the five characters", () => {
  assert.equal(escapeHtml(`<>&"'`), "&lt;&gt;&amp;&quot;&#39;");
});

test("JSON export round-trips", () => {
  const parsed = JSON.parse(exportBriefJson(brief())) as Brief;
  assert.equal(parsed.one_liner, "<script>alert(1)</script>");
});

test("the diff reports added and removed evidence, unknowns and collisions", () => {
  const previous = brief();
  const next = brief({
    evidence: ["clm_2"],
    unknowns: ["u2"],
    collisions: [
      {
        kind: "mechanism",
        prior_id: "pa_2",
        prior_label: "Prior 2",
        severity: "high",
        note: "n2",
      },
    ],
  });
  const diff = diffBriefs(previous, next);
  assert.deepEqual(diff.added_evidence, ["clm_2"]);
  assert.deepEqual(diff.removed_evidence, ["clm_1"]);
  assert.deepEqual(diff.added_unknowns, ["u2"]);
  assert.deepEqual(diff.removed_unknowns, ["u"]);
  assert.deepEqual(diff.added_collisions, ["mechanism:pa_2"]);
  assert.deepEqual(diff.removed_collisions, ["interface:pa_1"]);
  assert.match(renderBriefDiffMarkdown(diff), /# Brief diff/);
});

test("HTML renders the collision status, claims and source", () => {
  const html = exportBriefHtml(
    brief({
      collision_check: { status: "checked", note: "1 collision found." },
      collisions: [
        {
          kind: "mechanism",
          prior_id: "pa_1",
          prior_label: "Prior",
          severity: "high",
          note: "collides",
          claim_ids: ["clm_1"],
          source_url: "https://example.org/pa_1",
        },
      ],
    }),
  );
  assert.match(html, /Novelty and collisions/);
  assert.match(html, /Status: <strong>checked<\/strong>/);
  assert.match(html, /https:\/\/example\.org\/pa_1/);
  assert.match(html, /clm_1/);
});

test("HTML says when the novelty check did not run", () => {
  const html = exportBriefHtml(brief());
  assert.match(html, /Status: <strong>not_checked<\/strong>/);
  assert.match(html, /not a clean result/);
});

test("HTML escapes hostile claim and source values", () => {
  const html = exportBriefHtml(
    brief({
      collisions: [
        {
          kind: "mechanism",
          prior_id: "pa_1",
          prior_label: "Prior",
          severity: "high",
          note: "collides",
          claim_ids: ["<script>alert(1)</script>"],
          source_url: "https://example.org/?q=<script>",
        },
      ],
    }),
  );
  assert.equal(html.includes("<script>alert(1)</script>"), false);
  assert.match(html, /&lt;script&gt;/);
});
