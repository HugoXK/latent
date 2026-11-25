import test from "node:test";
import assert from "node:assert/strict";
import {
  FakeModelProvider,
  FakeSearchProvider,
  InMemoryCalibrator,
  NoopAgentRuntime,
  TemplateReconstructor,
} from "../src/index.js";
import type { Fragment } from "@latent/core";

const fragment: Fragment = {
  id: "frg_test0001",
  captured_at: "2026-11-25T00:00:00Z",
  kind: "text",
  content: "soil biosensor for heavy metals",
  privacy: "private",
};

test("the template reconstructor always returns alternatives and assumptions", async () => {
  const out = await new TemplateReconstructor().reconstruct({
    fragment,
    verticalId: "igem",
  });
  assert.equal(out.hypotheses.length, 3);
  assert.deepEqual(
    out.hypotheses.map((h) => h.variant),
    ["conservative", "ambitious", "cross_domain"],
  );
  assert.ok(out.assumptions.some((a) => a.risk === "high"));
  assert.ok(out.claims.some((c) => c.status === "unknown"));
  assert.ok(out.open_questions.length >= 1);
});

test("the template reconstructor is deterministic", async () => {
  const reconstructor = new TemplateReconstructor();
  const a = await reconstructor.reconstruct({ fragment, verticalId: "igem" });
  const b = await reconstructor.reconstruct({ fragment, verticalId: "igem" });
  assert.deepEqual(a, b);
});

test("fakes satisfy their ports", async () => {
  const model = new FakeModelProvider("ok");
  assert.deepEqual(await model.complete({ prompt: "hi" }), { text: "ok" });
  assert.deepEqual(await model.embed(["a", "b"]), [
    [0, 0, 0],
    [0, 0, 0],
  ]);

  const search = new FakeSearchProvider([
    { id: "1", title: "soil", url: "https://example.org", snippet: "x" },
  ]);
  assert.equal((await search.search("soil")).length, 1);
  assert.equal((await search.search("nope")).length, 0);

  const runtime = new NoopAgentRuntime();
  assert.deepEqual(await runtime.schedule({ id: "j", kind: "incubate", payload: {} }), {
    ref: "noop",
  });

  const calibrator = new InMemoryCalibrator();
  await calibrator.record({ id: "p", confidence: 0.7 }, { id: "o", value: true });
  assert.equal(calibrator.rows.length, 1);
});
