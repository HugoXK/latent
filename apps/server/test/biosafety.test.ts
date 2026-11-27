import test from "node:test";
import assert from "node:assert/strict";
import { buildServer } from "../src/index.js";
import { Store } from "@latent/store";

const AUTH = { authorization: "Bearer test-token" };

test("a select agent is refused before an idea is created", async () => {
  const store = new Store(":memory:");
  const app = buildServer({ store, authToken: "test-token" });
  try {
    const fragmentRes = await app.inject({
      method: "POST",
      url: "/v1/fragments",
      headers: AUTH,
      payload: {
        content: "engineer Bacillus anthracis to increase transmissibility",
      },
    });
    assert.equal(fragmentRes.statusCode, 201);
    const fragment = fragmentRes.json() as { id: string };

    const ideaRes = await app.inject({
      method: "POST",
      url: "/v1/ideas",
      headers: AUTH,
      payload: { fragment_id: fragment.id, vertical: "igem" },
    });
    assert.equal(ideaRes.statusCode, 422);
    const body = ideaRes.json() as {
      error: { code: string; details: { category: string } };
    };
    assert.equal(body.error.code, "BIOSAFETY_BLOCKED");
    assert.equal(body.error.details.category, "select_agent");
    assert.ok(!JSON.stringify(body).toLowerCase().includes("anthracis"));
    assert.equal(store.listIdeas().length, 0);
  } finally {
    await app.close();
    store.close();
  }
});
