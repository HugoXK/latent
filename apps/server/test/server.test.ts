import test from "node:test";
import assert from "node:assert/strict";
import { buildServer } from "../src/index.js";
import { Store } from "@latent/store";

test("API: fragment -> idea -> decide -> brief", async () => {
  const store = new Store(":memory:");
  const app = buildServer({ store, authToken: "test-token" });
  const AUTH = { authorization: "Bearer test-token" };
  try {
    const fragmentRes = await app.inject({
      headers: AUTH,
      method: "POST",
      url: "/v1/fragments",
      payload: { content: "soil biosensor for heavy metals" },
    });
    assert.equal(fragmentRes.statusCode, 201);
    const fragment = fragmentRes.json() as { id: string };

    const ideaRes = await app.inject({
      headers: AUTH,
      method: "POST",
      url: "/v1/ideas",
      payload: { fragment_id: fragment.id, vertical: "igem" },
    });
    assert.equal(ideaRes.statusCode, 201);
    const body = ideaRes.json() as {
      idea: { id: string; assumptions: Array<{ id: string }> };
      gates: Array<{ id: string }>;
    };

    const blocked = await app.inject({
      headers: AUTH,
      method: "POST",
      url: `/v1/ideas/${body.idea.id}/brief`,
    });
    assert.equal(blocked.statusCode, 409);

    const constraintsRes = await app.inject({
      headers: AUTH,
      method: "GET",
      url: `/v1/ideas/${body.idea.id}/constraints`,
    });
    assert.equal(constraintsRes.statusCode, 200);
    const constraints = constraintsRes.json() as {
      blocking: string[];
      next_question: { blocking?: boolean } | null;
    };
    assert.ok(constraints.blocking.length > 0);
    assert.equal(constraints.next_question?.blocking, true);

    const answers: Array<[string, number | string]> = [
      ["lab.bsl", 1],
      ["lab.readers", "plate_reader"],
      ["time.summer_weeks", 6],
      ["success.metric", "detection_limit"],
    ];
    for (const [variable, value] of answers) {
      const res = await app.inject({
      headers: AUTH,
        method: "POST",
        url: `/v1/ideas/${body.idea.id}/constraints/answer`,
        payload: { variable, value },
      });
      assert.equal(res.statusCode, 200);
    }

    const multi = await app.inject({
      headers: AUTH,
      method: "POST",
      url: `/v1/ideas/${body.idea.id}/constraints/answer`,
      payload: { variable: "lab.equipment", value: ["plate_reader", "hplc"] },
    });
    assert.equal(multi.statusCode, 200);

    const text = await app.inject({
      headers: AUTH,
      method: "POST",
      url: `/v1/ideas/${body.idea.id}/constraints/answer`,
      payload: { variable: "candidate.a", value: "soil biosensor for arsenic" },
    });
    assert.equal(text.statusCode, 200);

    for (const assumption of body.idea.assumptions) {
      const res = await app.inject({
      headers: AUTH,
        method: "POST",
        url: `/v1/ideas/${body.idea.id}/assumptions/${assumption.id}/decide`,
        payload: { status: "confirmed" },
      });
      assert.equal(res.statusCode, 200);
    }

    for (const gate of body.gates) {
      const res = await app.inject({
      headers: AUTH,
        method: "POST",
        url: `/v1/ideas/${body.idea.id}/gates/${gate.id}/decide`,
        payload: { status: "pass", reason: "test" },
      });
      assert.equal(res.statusCode, 200);
    }

    const briefRes = await app.inject({
      headers: AUTH,
      method: "POST",
      url: `/v1/ideas/${body.idea.id}/brief`,
      payload: {
        components: [
          {
            id: "c1",
            name: "arsR",
            source: "Registry",
            grade: "B",
            length_bp: 800,
          },
        ],
        timeline: {
          tasks: [
            { id: "t1", name: "build", min_weeks: 1, likely_weeks: 2, max_weeks: 4 },
          ],
          calendar: { summer_full_weeks: 10 },
          runs: 200,
          seed: 7,
        },
        material: {
          target: "product",
          target_amount: 1,
          reactions: [
            {
              id: "r1",
              substrates: { glucose: 2 },
              products: { product: 1 },
            },
          ],
          available: { glucose: 10 },
        },
      },
    });
    assert.equal(briefRes.statusCode, 201);
    const brief = briefRes.json() as {
      unknowns: string[];
      validators: unknown[];
      evidence: string[];
      sections?: Array<{ title: string }>;
    };
    assert.ok(brief.unknowns.length >= 1);
    assert.equal(brief.validators.length, 4);
    assert.deepEqual(
      (brief.sections ?? []).map((section) => section.title),
      ["Components", "Timeline", "Material balance"],
    );

    const stored = await app.inject({
      headers: AUTH,
      method: "GET",
      url: `/v1/ideas/${body.idea.id}`,
    });
    assert.equal(stored.statusCode, 200);
  } finally {
    await app.close();
    store.close();
  }
});
