import test from "node:test";
import assert from "node:assert/strict";
import { buildServer } from "../src/index.js";
import { Store } from "@latent/store";

const AUTH = { authorization: "Bearer test-token" };

test("the API accepts the second vertical without an iGEM branch", async () => {
  const store = new Store(":memory:");
  const app = buildServer({ store, authToken: "test-token" });
  try {
    const fragmentRes = await app.inject({
      method: "POST",
      url: "/v1/fragments",
      headers: AUTH,
      payload: { content: "a citation-checking replication study" },
    });
    assert.equal(fragmentRes.statusCode, 201);
    const fragment = fragmentRes.json() as { id: string };

    const ideaRes = await app.inject({
      method: "POST",
      url: "/v1/ideas",
      headers: AUTH,
      payload: { fragment_id: fragment.id, vertical: "research" },
    });
    assert.equal(ideaRes.statusCode, 201);
    const body = ideaRes.json() as { idea: { id: string; vertical: string } };
    assert.equal(body.idea.vertical, "research");

    const constraints = await app.inject({
      method: "GET",
      url: `/v1/ideas/${body.idea.id}/constraints`,
      headers: AUTH,
    });
    assert.equal(constraints.statusCode, 200);
    const constraintBody = constraints.json() as {
      blocking: string[];
      next_question: { variable: string } | null;
    };
    assert.ok(constraintBody.blocking.includes("field"));
    assert.equal(constraintBody.next_question?.variable, "field");

    const priors = await app.inject({
      method: "GET",
      url: "/v1/priors?vertical=research",
      headers: AUTH,
    });
    assert.equal(priors.statusCode, 200);
    assert.equal((priors.json() as { vertical: string }).vertical, "research");

    const unknown = await app.inject({
      method: "POST",
      url: "/v1/ideas",
      headers: AUTH,
      payload: { fragment_id: fragment.id, vertical: "nope" },
    });
    assert.equal(unknown.statusCode, 400);
  } finally {
    await app.close();
    store.close();
  }
});
