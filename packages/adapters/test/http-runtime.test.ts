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

test("callbacks are job-scoped, timestamped and tamper-evident", () => {
  const secret = "root-secret";
  const jobId = "job_1";
  const timestamp = "2026-11-27T00:00:00Z";
  const body = '{"status":"succeeded"}';
  const signature = signJobCallback({ secret, jobId, timestamp, body });
  const now = Date.parse(timestamp);

  assert.equal(
    verifyJobCallback({ secret, jobId, timestamp, body, signature, now }),
    true,
  );
  assert.equal(
    verifyJobCallback({
      secret,
      jobId,
      timestamp,
      body: '{"status":"failed"}',
      signature,
      now,
    }),
    false,
  );
  assert.equal(
    verifyJobCallback({
      secret,
      jobId: "job_2",
      timestamp,
      body,
      signature,
      now,
    }),
    false,
  );
  assert.equal(
    verifyJobCallback({
      secret,
      jobId,
      timestamp,
      body,
      signature,
      now: now + 600_000,
    }),
    false,
  );
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
