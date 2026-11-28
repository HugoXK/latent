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

    // The refusal is persisted content-free, with the fragment id as subject.
    const events = store.listEvents(fragment.id);
    const refused = events.find((event) => event.type === "biosafety.refused");
    assert.ok(refused);
    const data = JSON.stringify(refused.data).toLowerCase();
    assert.ok(data.includes("select_agent"));
    assert.ok(!data.includes("anthracis"));
    assert.ok(!data.includes("engineer"));
  } finally {
    await app.close();
    store.close();
  }
});


test("an unanswered BSL refuses BSL-2 pathogen work before an idea exists", async () => {
  const store = new Store(":memory:");
  const app = buildServer({ store, authToken: "test-token" });
  try {
    const fragmentRes = await app.inject({
      method: "POST",
      url: "/v1/fragments",
      headers: AUTH,
      payload: { content: "detect salmonella in food" },
    });
    const fragment = fragmentRes.json() as { id: string };
    const ideaRes = await app.inject({
      method: "POST",
      url: "/v1/ideas",
      headers: AUTH,
      payload: { fragment_id: fragment.id, vertical: "research" },
    });
    assert.equal(ideaRes.statusCode, 422);
    assert.equal(store.listIdeas().length, 0);

    const declared = await app.inject({
      method: "POST",
      url: "/v1/ideas",
      headers: AUTH,
      payload: { fragment_id: fragment.id, vertical: "research", bsl: 2 },
    });
    assert.equal(declared.statusCode, 201);
    assert.equal(store.listIdeas().length, 1);
  } finally {
    await app.close();
    store.close();
  }
});
