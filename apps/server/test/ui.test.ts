import test from "node:test";
import assert from "node:assert/strict";
import { buildServer } from "../src/index.js";
import { Store } from "@latent/store";

test("the UI shell is public while the API stays authenticated", async () => {
  const store = new Store(":memory:");
  const app = buildServer({ store, authToken: "test-token" });
  try {
    const root = await app.inject({ method: "GET", url: "/" });
    assert.equal(root.statusCode, 200);
    assert.match(root.headers["content-type"] ?? "", /text\/html/);
    assert.match(root.body, /<title>Latent/);
    assert.match(root.body, /id="capture-form"/);
    assert.ok(root.headers["content-security-policy"]);

    const script = await app.inject({ method: "GET", url: "/ui/app.js" });
    assert.equal(script.statusCode, 200);
    assert.match(script.headers["content-type"] ?? "", /javascript/);
    assert.match(script.body, /const state/);

    const style = await app.inject({ method: "GET", url: "/ui/style.css" });
    assert.equal(style.statusCode, 200);
    assert.match(style.headers["content-type"] ?? "", /text\/css/);

    const unauthenticated = await app.inject({
      method: "GET",
      url: "/v1/calibration",
    });
    assert.equal(unauthenticated.statusCode, 401);

    const authenticated = await app.inject({
      method: "GET",
      url: "/v1/calibration",
      headers: { authorization: "Bearer test-token" },
    });
    assert.equal(authenticated.statusCode, 200);
  } finally {
    await app.close();
    store.close();
  }
});
