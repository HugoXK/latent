import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildServer } from "../src/index.js";
import { Store } from "@latent/store";

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const SPEC_PATH = join(ROOT, "openapi/latent.openapi.json");

interface Spec {
  openapi: string;
  security?: unknown[];
  components: {
    securitySchemes?: Record<string, unknown>;
    parameters?: Record<string, unknown>;
    schemas?: Record<string, unknown>;
  };
  paths: Record<string, Record<string, unknown>>;
}

function spec(): Spec {
  return JSON.parse(readFileSync(SPEC_PATH, "utf8")) as Spec;
}

function normalizePath(path: string): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

/**
 * Fastify's route tree is the source of truth for "what the server actually
 * serves". Each tree level adds four characters; the path is the concatenation of
 * the segments down to that line.
 */
function actualRoutes(app: ReturnType<typeof buildServer>): string[] {
  const lines = app.printRoutes({ commonPrefix: false }).split("\n");
  const segments: string[] = [];
  const routes: string[] = [];
  for (const line of lines) {
    if (line.trim() === "") continue;
    const match = /^([│├└─ ]*)(\S+)(?: \(([^)]*)\))?$/.exec(line);
    if (!match) continue;
    const lead = match[1] ?? "";
    const segment = match[2] ?? "";
    const methods = match[3];
    const depth = Math.max(0, lead.length / 4 - 1);
    segments[depth] = segment;
    segments.length = depth + 1;
    if (!methods) continue;
    const path = normalizePath(segments.slice(0, depth + 1).join(""));
    for (const method of methods.split(",").map((item) => item.trim())) {
      if (method === "" || method === "HEAD") continue;
      routes.push(`${method.toLowerCase()} ${path}`);
    }
  }
  return routes.sort();
}

function specRoutes(document: Spec): string[] {
  const routes: string[] = [];
  const methods = ["get", "post", "put", "patch", "delete"];
  for (const [path, operations] of Object.entries(document.paths)) {
    for (const method of methods) {
      if (method in operations) routes.push(`${method} ${path}`);
    }
  }
  return routes.sort();
}

function localRefs(value: unknown): string[] {
  const refs: string[] = [];
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (node !== null && typeof node === "object") {
      const record = node as Record<string, unknown>;
      if (typeof record.$ref === "string") refs.push(record.$ref);
      for (const item of Object.values(record)) walk(item);
    }
  };
  walk(value);
  return refs;
}

test("the OpenAPI 3.1 spec matches the Fastify routes", async () => {
  const store = new Store(":memory:");
  const app = buildServer({ store, authToken: "test-token" });
  try {
    const document = spec();
    assert.equal(document.openapi, "3.1.0");
    assert.equal(
      (document.components.securitySchemes as Record<string, { scheme?: string }>)
        ?.bearerAuth?.scheme,
      "bearer",
    );
    assert.ok(document.security);

    assert.deepEqual(specRoutes(document), actualRoutes(app));

    for (const [path, operations] of Object.entries(document.paths)) {
      for (const [method, operation] of Object.entries(operations)) {
        const op = operation as {
          operationId?: string;
          responses?: Record<string, unknown>;
          "x-latent-scope"?: string;
        };
        assert.ok(op.operationId, `${method} ${path} needs an operationId`);
        assert.ok(op.responses?.["200"] ?? op.responses?.["201"], `${method} ${path} needs a success response`);
        if (path.startsWith("/v1/")) {
          assert.ok(op.responses?.["401"], `${method} ${path} must document 401`);
          assert.ok(op["x-latent-scope"], `${method} ${path} must name a scope`);
        }
      }
    }

    const refs = localRefs(document);
    for (const ref of refs) {
      if (ref.startsWith("#/components/parameters/")) {
        const name = ref.slice("#/components/parameters/".length);
        assert.ok(
          document.components.parameters?.[name],
          `unresolved parameter ref: ${ref}`,
        );
      }
      if (ref.startsWith("../data/schemas/")) {
        const path = join(dirname(SPEC_PATH), ref);
        assert.ok(existsSync(path), `missing schema ref: ${ref}`);
      }
    }
  } finally {
    await app.close();
    store.close();
  }
});
