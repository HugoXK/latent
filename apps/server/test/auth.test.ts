import test from "node:test";
import assert from "node:assert/strict";
import { buildServer, type ServerOptions } from "../src/index.js";
import { Store } from "@latent/store";

const ADMIN = { authorization: "Bearer admin-token" };

function makeServer(options: Omit<ServerOptions, "store"> = {}) {
  const store = new Store(":memory:");
  const app = buildServer({
    store,
    authToken: "admin-token",
    ...options,
  });
  return { app, store };
}

test("writes require a bearer token; health stays public", async () => {
  const { app, store } = makeServer();
  try {
    const health = await app.inject({ method: "GET", url: "/healthz" });
    assert.equal(health.statusCode, 200);

    const missing = await app.inject({
      method: "POST",
      url: "/v1/fragments",
      payload: { content: "x" },
    });
    assert.equal(missing.statusCode, 401);
    assert.equal(
      (missing.json() as { error: { code: string } }).error.code,
      "UNAUTHENTICATED",
    );

    const invalid = await app.inject({
      method: "POST",
      url: "/v1/fragments",
      headers: { authorization: "Bearer wrong" },
      payload: { content: "x" },
    });
    assert.equal(invalid.statusCode, 401);

    const ok = await app.inject({
      method: "POST",
      url: "/v1/fragments",
      headers: ADMIN,
      payload: { content: "soil biosensor" },
    });
    assert.equal(ok.statusCode, 201);
  } finally {
    await app.close();
    store.close();
  }
});

test("scopes are enforced per route", async () => {
  const { app, store } = makeServer({
    authTokens: [
      { token: "admin-token", scopes: ["*"] },
      { token: "reader-token", scopes: ["fragments:read"] },
    ],
  });
  try {
    const created = await app.inject({
      method: "POST",
      url: "/v1/fragments",
      headers: ADMIN,
      payload: { content: "soil biosensor" },
    });
    assert.equal(created.statusCode, 201);
    const id = (created.json() as { id: string }).id;

    const read = await app.inject({
      method: "GET",
      url: `/v1/fragments/${id}`,
      headers: { authorization: "Bearer reader-token" },
    });
    assert.equal(read.statusCode, 200);

    const write = await app.inject({
      method: "POST",
      url: "/v1/fragments",
      headers: { authorization: "Bearer reader-token" },
      payload: { content: "no scope" },
    });
    assert.equal(write.statusCode, 403);
    const body = write.json() as {
      error: { code: string; details: { required: string } };
    };
    assert.equal(body.error.code, "FORBIDDEN");
    assert.equal(body.error.details.required, "fragments:write");
  } finally {
    await app.close();
    store.close();
  }
});

test("cross-origin requests and non-loopback hosts are refused", async () => {
  const { app, store } = makeServer();
  try {
    const crossOrigin = await app.inject({
      method: "POST",
      url: "/v1/fragments",
      headers: { ...ADMIN, origin: "https://evil.example" },
      payload: { content: "x" },
    });
    assert.equal(crossOrigin.statusCode, 403);
    assert.equal(
      (crossOrigin.json() as { error: { code: string } }).error.code,
      "CSRF_FAILED",
    );

    const badHost = await app.inject({
      method: "POST",
      url: "/v1/fragments",
      headers: { ...ADMIN, host: "evil.example" },
      payload: { content: "x" },
    });
    assert.equal(badHost.statusCode, 403);
    assert.equal(
      (badHost.json() as { error: { code: string } }).error.code,
      "HOST_NOT_ALLOWED",
    );

    const sameOrigin = await app.inject({
      method: "POST",
      url: "/v1/fragments",
      headers: { ...ADMIN, origin: "http://localhost:80" },
      payload: { content: "x" },
    });
    assert.equal(sameOrigin.statusCode, 201);
  } finally {
    await app.close();
    store.close();
  }
});

test("rate limits return a stable error", async () => {
  const { app, store } = makeServer({
    rateLimit: { limit: 2, windowMs: 60_000 },
  });
  try {
    const first = await app.inject({
      method: "GET",
      url: "/v1/calibration",
      headers: ADMIN,
    });
    const second = await app.inject({
      method: "GET",
      url: "/v1/calibration",
      headers: ADMIN,
    });
    const third = await app.inject({
      method: "GET",
      url: "/v1/calibration",
      headers: ADMIN,
    });
    assert.equal(first.statusCode, 200);
    assert.equal(second.statusCode, 200);
    assert.equal(third.statusCode, 429);
    assert.ok(third.headers["retry-after"]);
    const body = third.json() as {
      error: { code: string; details: { retry_after_seconds: number } };
    };
    assert.equal(body.error.code, "RATE_LIMITED");
    assert.ok(body.error.details.retry_after_seconds > 0);
  } finally {
    await app.close();
    store.close();
  }
});

test("an oversized body is refused with a stable error", async () => {
  const { app, store } = makeServer({ bodyLimit: 128 });
  try {
    const response = await app.inject({
      method: "POST",
      url: "/v1/fragments",
      headers: ADMIN,
      payload: { content: "x".repeat(512) },
    });
    assert.equal(response.statusCode, 413);
    assert.equal(
      (response.json() as { error: { code: string } }).error.code,
      "BODY_TOO_LARGE",
    );
  } finally {
    await app.close();
    store.close();
  }
});
