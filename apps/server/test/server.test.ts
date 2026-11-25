import test from "node:test";
import assert from "node:assert/strict";
import { buildServer } from "../src/index.js";
import { Store } from "@latent/store";

test("API: fragment -> idea -> decide -> brief", async () => {
  const store = new Store(":memory:");
  const app = buildServer({ store });
  try {
    const fragmentRes = await app.inject({
      method: "POST",
      url: "/v1/fragments",
      payload: { content: "soil biosensor for heavy metals" },
    });
    assert.equal(fragmentRes.statusCode, 201);
    const fragment = fragmentRes.json() as { id: string };

    const ideaRes = await app.inject({
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
      method: "POST",
      url: `/v1/ideas/${body.idea.id}/brief`,
    });
    assert.equal(blocked.statusCode, 409);

    for (const assumption of body.idea.assumptions) {
      const res = await app.inject({
        method: "POST",
        url: `/v1/ideas/${body.idea.id}/assumptions/${assumption.id}/decide`,
        payload: { status: "confirmed" },
      });
      assert.equal(res.statusCode, 200);
    }

    for (const gate of body.gates) {
      const res = await app.inject({
        method: "POST",
        url: `/v1/ideas/${body.idea.id}/gates/${gate.id}/decide`,
        payload: { status: "pass", reason: "test" },
      });
      assert.equal(res.statusCode, 200);
    }

    const briefRes = await app.inject({
      method: "POST",
      url: `/v1/ideas/${body.idea.id}/brief`,
    });
    assert.equal(briefRes.statusCode, 201);
    const brief = briefRes.json() as {
      unknowns: string[];
      validators: unknown[];
      evidence: string[];
    };
    assert.ok(brief.unknowns.length >= 1);
    assert.equal(brief.validators.length, 4);

    const stored = await app.inject({
      method: "GET",
      url: `/v1/ideas/${body.idea.id}`,
    });
    assert.equal(stored.statusCode, 200);
  } finally {
    await app.close();
    store.close();
  }
});
