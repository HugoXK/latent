import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  HttpAgentRuntime,
  NoopAgentRuntime,
  RuntimeError,
  runtimeFromEnv,
  signJobCallback,
  verifyJobCallback,
} from "../src/index.js";
import type { RuntimeFetch, RuntimeResponse } from "../src/index.js";

function jsonResponse(body: unknown, status = 200): RuntimeResponse {
  return {
    ok: status < 400,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
  };
}

test("schedule sends the runtime token, idempotency key and callback", async () => {
  const calls: Array<{
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  }> = [];
  const fetchImpl: RuntimeFetch = async (url, init) => {
    calls.push({ url, method: init.method, headers: init.headers, body: init.body });
    return jsonResponse({ ref: "fly_1" }, 201);
  };
  const runtime = new HttpAgentRuntime({
    baseUrl: "https://fly.example/",
    token: "runtime-token",
    callbackUrl: "https://latent.local/callback",
    fetchImpl,
  });

  const result = await runtime.schedule({
    id: "job_1",
    kind: "incubate",
    payload: { seed: { type: "idea", id: "idea_1" }, budget: 2 },
  });
  assert.deepEqual(result, { ref: "fly_1" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, "https://fly.example/v1/jobs");
  assert.equal(calls[0]?.method, "POST");
  assert.equal(calls[0]?.headers["Authorization"], "Bearer runtime-token");
  assert.equal(calls[0]?.headers["Idempotency-Key"], "job_1");
  const body = JSON.parse(calls[0]?.body ?? "{}") as {
    id: string;
    kind: string;
    payload: {
      seed: unknown;
      budget: number;
      callback: { url: string; job_id: string };
    };
  };
  assert.equal(body.id, "job_1");
  assert.equal(body.kind, "incubate");
  assert.deepEqual(body.payload.seed, { type: "idea", id: "idea_1" });
  assert.equal(body.payload.budget, 2);
  assert.deepEqual(body.payload.callback, {
    url: "https://latent.local/callback",
    job_id: "job_1",
  });
});

test("cancel posts to the job-scoped cancel path", async () => {
  const urls: string[] = [];
  const runtime = new HttpAgentRuntime({
    baseUrl: "https://fly.example",
    token: "runtime-token",
    fetchImpl: async (url) => {
      urls.push(url);
      return jsonResponse({}, 200);
    },
  });
  await runtime.cancel("fly_1");
  assert.deepEqual(urls, ["https://fly.example/v1/jobs/fly_1/cancel"]);
});

test("a runtime error is typed and does not echo the token", async () => {
  const runtime = new HttpAgentRuntime({
    baseUrl: "https://fly.example",
    token: "super-secret-runtime-token",
    fetchImpl: async () => jsonResponse({ error: "down" }, 503),
  });
  await assert.rejects(
    () => runtime.schedule({ id: "job_1", kind: "incubate", payload: {} }),
    (error: unknown) => {
      assert.ok(error instanceof RuntimeError);
      assert.equal(error.code, "RUNTIME_HTTP_ERROR");
      assert.equal(error.status, 503);
      assert.ok(!error.message.includes("super-secret-runtime-token"));
      return true;
    },
  );
});

test("an invalid response fails closed", async () => {
  const runtime = new HttpAgentRuntime({
    baseUrl: "https://fly.example",
    token: "t",
    fetchImpl: async () => jsonResponse({}, 200),
  });
  await assert.rejects(
    () => runtime.schedule({ id: "job_1", kind: "incubate", payload: {} }),
    (error: unknown) =>
      error instanceof RuntimeError &&
      error.code === "INVALID_RUNTIME_RESPONSE",
  );
});

test("a silent runtime times out", async () => {
  const fetchImpl: RuntimeFetch = (_url, init) =>
    new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      });
    });
  const runtime = new HttpAgentRuntime({
    baseUrl: "https://fly.example",
    token: "t",
    timeoutMs: 10,
    fetchImpl,
  });
  await assert.rejects(
    () => runtime.schedule({ id: "job_1", kind: "incubate", payload: {} }),
    (error: unknown) =>
      error instanceof RuntimeError && error.code === "RUNTIME_TIMEOUT",
  );
});

const CALLBACK_SECRET = "root" + "-" + "secret" + "-" + "0123456789";
const CALLBACK_NOW = Date.parse("2026-11-27T00:00:00Z");

test("callbacks are job-scoped, canonical, nonce-bound and replay-safe", () => {
  const secret = CALLBACK_SECRET;
  const jobId = "job_1";
  const timestamp = "2026-11-27T00:00:00Z";
  const nonce = "nonce-1";
  const body = '{"status":"succeeded"}';
  const signature = signJobCallback({ secret, jobId, timestamp, nonce, body });
  const seen = new Set<string>();

  assert.equal(
    verifyJobCallback({ secret, jobId, timestamp, nonce, body, signature, now: CALLBACK_NOW, seenNonces: seen }),
    true,
  );
  // The second verification of the same nonce is rejected, not just stale.
  assert.equal(
    verifyJobCallback({ secret, jobId, timestamp, nonce, body, signature, now: CALLBACK_NOW, seenNonces: seen }),
    false,
  );
  assert.equal(
    verifyJobCallback({
      secret, jobId, timestamp, nonce: "nonce-2", body, signature, now: CALLBACK_NOW,
    }),
    false,
  );
  assert.equal(
    verifyJobCallback({
      secret, jobId: "job_2", timestamp, nonce, body, signature, now: CALLBACK_NOW,
    }),
    false,
  );
  assert.equal(
    verifyJobCallback({
      secret, jobId, timestamp, nonce, body: '{"status":"failed"}', signature, now: CALLBACK_NOW,
    }),
    false,
  );
});

test("a future or stale callback is rejected", () => {
  const timestamp = "2026-11-27T00:00:00Z";
  const future = new Date(CALLBACK_NOW + 240_000).toISOString();
  const futureSig = signJobCallback({
    secret: CALLBACK_SECRET, jobId: "job_1", timestamp: future, nonce: "n-future", body: "{}",
  });
  assert.equal(
    verifyJobCallback({
      secret: CALLBACK_SECRET, jobId: "job_1", timestamp: future, nonce: "n-future",
      body: "{}", signature: futureSig, now: CALLBACK_NOW,
    }),
    false,
  );

  const staleSig = signJobCallback({
    secret: CALLBACK_SECRET, jobId: "job_1", timestamp, nonce: "n-stale", body: "{}",
  });
  assert.equal(
    verifyJobCallback({
      secret: CALLBACK_SECRET, jobId: "job_1", timestamp, nonce: "n-stale",
      body: "{}", signature: staleSig, now: CALLBACK_NOW + 600_000,
    }),
    false,
  );
});

test("dot-separated field pairs cannot collide into the same signature", () => {
  const first = signJobCallback({
    secret: CALLBACK_SECRET,
    jobId: "job_1",
    timestamp: "2026-11-27T00:00:00.500",
    nonce: "n1",
    body: "x",
  });
  const second = signJobCallback({
    secret: CALLBACK_SECRET,
    jobId: "job_1",
    timestamp: "2026-11-27T00:00:00",
    nonce: "n1",
    body: "500.x",
  });
  assert.notEqual(first, second);
  assert.equal(
    verifyJobCallback({
      secret: CALLBACK_SECRET,
      jobId: "job_1",
      timestamp: "2026-11-27T00:00:00",
      nonce: "n1",
      body: "500.x",
      signature: first,
      now: CALLBACK_NOW,
    }),
    false,
  );
});

test("a callback signed with another key id is rejected", () => {
  const timestamp = "2026-11-27T00:00:00Z";
  const signature = signJobCallback({
    secret: CALLBACK_SECRET, jobId: "job_1", timestamp, nonce: "n", body: "{}", keyId: "v2",
  });
  assert.equal(
    verifyJobCallback({
      secret: CALLBACK_SECRET, jobId: "job_1", timestamp, nonce: "n", body: "{}",
      signature, keyId: "v1", now: CALLBACK_NOW,
    }),
    false,
  );
});

test("a root secret shorter than the documented minimum is rejected", () => {
  assert.throws(
    () => signJobCallback({ secret: "short", jobId: "job_1", timestamp: "2026-11-27T00:00:00Z", nonce: "n", body: "{}" }),
    (error: unknown) => error instanceof RuntimeError && error.code === "RUNTIME_CONFIG",
  );
});

test("plain http is rejected except loopback or the explicit test flag", () => {
  assert.throws(
    () => new HttpAgentRuntime({ baseUrl: "http://fly.example", token: "t" }),
    (error: unknown) => error instanceof RuntimeError && error.code === "RUNTIME_CONFIG",
  );
  assert.ok(new HttpAgentRuntime({ baseUrl: "http://127.0.0.1:8080", token: "t" }));
  assert.ok(new HttpAgentRuntime({ baseUrl: "http://fly.example", token: "t", allowInsecureHttp: true }));
});

test("baseUrl userinfo is rejected", () => {
  assert.throws(
    () => new HttpAgentRuntime({ baseUrl: "https://user:pass@fly.example", token: "t" }),
    (error: unknown) => error instanceof RuntimeError && error.code === "RUNTIME_CONFIG",
  );
});

test("requests use redirect: error and never follow a redirect with the token", async () => {
  let redirect: string | undefined;
  const runtime = new HttpAgentRuntime({
    baseUrl: "https://fly.example",
    token: "t",
    fetchImpl: async (_url, init) => {
      redirect = init.redirect;
      return jsonResponse({ ref: "fly_1" });
    },
  });
  await runtime.schedule({ id: "job_1", kind: "incubate", payload: {} });
  assert.equal(redirect, "error");
});

test("job payload is a descriptor allowlist, not a private data channel", async () => {
  let calls = 0;
  const runtime = new HttpAgentRuntime({
    baseUrl: "https://fly.example",
    token: "t",
    fetchImpl: async () => {
      calls += 1;
      return jsonResponse({ ref: "fly_1" });
    },
  });
  await assert.rejects(
    () => runtime.schedule({ id: "job_1", kind: "incubate", payload: { private_fragment: "secret" } }),
    (error: unknown) => error instanceof RuntimeError && error.code === "INVALID_JOB_PAYLOAD",
  );
  await assert.rejects(
    () => runtime.schedule({ id: "job_1", kind: "incubate", payload: { seed: { type: "idea", id: "x", text: "private" } } }),
    (error: unknown) => error instanceof RuntimeError && error.code === "INVALID_JOB_PAYLOAD",
  );
  await assert.rejects(
    () => runtime.schedule({ id: "job_1", kind: "incubate", payload: { since: "x".repeat(70_000) } }),
    (error: unknown) => error instanceof RuntimeError && error.code === "INVALID_JOB_PAYLOAD",
  );
  assert.equal(calls, 0);
});

test("runtimeFromEnv fails closed and defaults to the no-op runtime", () => {
  assert.ok(runtimeFromEnv({}) instanceof NoopAgentRuntime);
  assert.ok(
    runtimeFromEnv({ LATENT_RUNTIME: "none", LATENT_RUNTIME_URL: "https://fly.example" }) instanceof
      NoopAgentRuntime,
  );
  assert.throws(
    () => runtimeFromEnv({ LATENT_RUNTIME: "flybot" }),
    (error: unknown) =>
      error instanceof RuntimeError &&
      error.code === "RUNTIME_CONFIG_INCOMPLETE",
  );
  assert.ok(
    runtimeFromEnv({
      LATENT_RUNTIME: "flybot",
      LATENT_RUNTIME_URL: "https://fly.example",
      LATENT_RUNTIME_TOKEN: "t",
    }) instanceof HttpAgentRuntime,
  );
  for (const kind of ["htpp", "http", "flybott", "docker"]) {
    assert.throws(
      () =>
        runtimeFromEnv({
          LATENT_RUNTIME: kind,
          LATENT_RUNTIME_URL: "https://fly.example",
          LATENT_RUNTIME_TOKEN: "t",
        }),
      (error: unknown) =>
        error instanceof RuntimeError && error.code === "RUNTIME_CONFIG_INCOMPLETE",
      kind,
    );
  }
});

test("the recorded FlyBot contract matches the request we send", async () => {
  const path = fileURLToPath(
    new URL("../../../data/fixtures/runtime/flybot-contract.json", import.meta.url),
  );
  const recorded = JSON.parse(readFileSync(path, "utf8")) as {
    request: {
      method: string;
      path: string;
      headers: Record<string, string>;
      body: unknown;
    };
    response: { status: number; body: unknown };
  };
  const runtime = new HttpAgentRuntime({
    baseUrl: "https://fly.example",
    token: "runtime-token",
    callbackUrl: "https://latent.local/callback",
    fetchImpl: async (url, init) => {
      assert.equal(new URL(url).pathname, recorded.request.path);
      assert.equal(init.method, recorded.request.method);
      assert.equal(
        init.headers["Authorization"],
        recorded.request.headers["authorization"],
      );
      assert.equal(
        init.headers["Idempotency-Key"],
        recorded.request.headers["idempotency-key"],
      );
      assert.deepEqual(JSON.parse(init.body ?? "{}"), recorded.request.body);
      return jsonResponse(recorded.response.body, recorded.response.status);
    },
  });

  const result = await runtime.schedule({
    id: "job_recorded0001",
    kind: "incubate",
    payload: { seed: { type: "idea", id: "idea_1" }, budget: 2 },
  });
  assert.deepEqual(result, { ref: "fly_recorded0001" });
});

test("a base URL with many trailing slashes is normalized without backtracking", async () => {
  const urls: string[] = [];
  const runtime = new HttpAgentRuntime({
    baseUrl: `https://fly.example${"/".repeat(10_000)}`,
    token: "t",
    fetchImpl: async (url) => {
      urls.push(url);
      return jsonResponse({ ref: "fly_1" }, 200);
    },
  });
  await runtime.schedule({ id: "job_1", kind: "incubate", payload: {} });
  assert.deepEqual(urls, ["https://fly.example/v1/jobs"]);
});

test("a non-positive or non-finite timeout is rejected at construction", () => {
  for (const timeoutMs of [-1, 0, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(
      () =>
        new HttpAgentRuntime({
          baseUrl: "https://fly.example",
          token: "t",
          timeoutMs,
        }),
      (error: unknown) =>
        error instanceof RuntimeError && error.code === "RUNTIME_CONFIG",
      `timeoutMs=${String(timeoutMs)}`,
    );
  }
});
