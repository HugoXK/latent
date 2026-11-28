import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CLIENT_OPERATIONS,
  LatentClient,
  LatentApiError,
} from "../src/index.js";

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const SPEC_PATH = join(ROOT, "openapi/latent.openapi.json");

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("the client sends the bearer token and JSON body", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const client = new LatentClient({
    token: "test-token",
    baseUrl: "http://127.0.0.1:4310",
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return jsonResponse({ id: "frg_00000001" });
    },
  });

  const fragment = await client.capture({ content: "soil biosensor" });
  assert.equal(fragment.id, "frg_00000001");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, "http://127.0.0.1:4310/v1/fragments");
  assert.equal(calls[0]?.init?.method, "POST");
  const headers = calls[0]?.init?.headers as Record<string, string>;
  assert.equal(headers["Authorization"], "Bearer test-token");
  assert.equal(headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), {
    content: "soil biosensor",
  });
});

test("the client turns an API error into a typed error", async () => {
  const client = new LatentClient({
    token: "test-token",
    fetchImpl: async () =>
      jsonResponse(
        {
          error: {
            code: "UNAUTHENTICATED",
            message: "a bearer token is required",
            details: { scope: "fragments:write" },
          },
        },
        401,
      ),
  });

  await assert.rejects(
    () => client.capture({ content: "x" }),
    (error: unknown) => {
      assert.ok(error instanceof LatentApiError);
      assert.equal(error.status, 401);
      assert.equal(error.code, "UNAUTHENTICATED");
      assert.deepEqual(error.details, { scope: "fragments:write" });
      return true;
    },
  );
});

test("the client operation manifest matches the OpenAPI spec", () => {
  const spec = JSON.parse(readFileSync(SPEC_PATH, "utf8")) as {
    paths: Record<string, Record<string, { operationId?: string }>>;
  };

  for (const operation of CLIENT_OPERATIONS) {
    const path = spec.paths[operation.path];
    assert.ok(path, `spec is missing ${operation.path}`);
    const entry = path[operation.method];
    assert.ok(entry, `spec is missing ${operation.method} ${operation.path}`);
    assert.equal(entry.operationId, operation.operationId);
  }

  const manifest = new Set(
    CLIENT_OPERATIONS.map(
      (operation) => `${operation.method} ${operation.path}`,
    ),
  );
  for (const [path, operations] of Object.entries(spec.paths)) {
    for (const method of ["get", "post"]) {
      if (method in operations) {
        assert.ok(
          manifest.has(`${method} ${path}`),
          `client is missing ${method} ${path}`,
        );
      }
    }
  }
});

test("a base URL with many trailing slashes is normalized without backtracking", async () => {
  const urls: string[] = [];
  const client = new LatentClient({
    baseUrl: `http://127.0.0.1:4310${"/".repeat(10_000)}`,
    token: "t",
    fetchImpl: async (input) => {
      urls.push(String(input));
      return jsonResponse({ ok: true });
    },
  });
  await client.health();
  assert.deepEqual(urls, ["http://127.0.0.1:4310/healthz"]);
});
