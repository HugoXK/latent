import test from "node:test";
import assert from "node:assert/strict";
import {
  HashingEmbeddingProvider,
  HttpEmbeddingProvider,
  cosine,
} from "../src/index.js";
import type { EmbeddingFetch } from "../src/index.js";

test("hashing embeddings are deterministic and normalized", async () => {
  const provider = new HashingEmbeddingProvider(16);
  const [left, right] = await provider.embed([
    "arsenic biosensor",
    "arsenic biosensor",
  ]);
  assert.ok(left && right);
  assert.deepEqual(left, right);
  assert.ok(Math.abs(cosine(left, left) - 1) < 1e-9);
});

test("cosine handles an orthogonal pair", () => {
  assert.equal(cosine([1, 0], [0, 1]), 0);
});

test("the HTTP provider parses an OpenAI-compatible response", async () => {
  const fetchImpl: EmbeddingFetch = async () => ({
    ok: true,
    status: 200,
    text: async () => "",
    json: async () => ({
      data: [{ embedding: [1, 0, 0] }, { embedding: [0, 1, 0] }],
    }),
  });
  const provider = new HttpEmbeddingProvider({
    baseUrl: "https://example.test/v1",
    apiKey: "k",
    model: "m",
    fetchImpl,
  });
  assert.deepEqual(await provider.embed(["a", "b"]), [
    [1, 0, 0],
    [0, 1, 0],
  ]);
});

test("the HTTP provider fails on the wrong number of vectors", async () => {
  const fetchImpl: EmbeddingFetch = async () => ({
    ok: true,
    status: 200,
    text: async () => "",
    json: async () => ({ data: [] }),
  });
  const provider = new HttpEmbeddingProvider({
    baseUrl: "https://example.test/v1",
    apiKey: "k",
    model: "m",
    fetchImpl,
  });
  await assert.rejects(() => provider.embed(["a"]), /wrong number/);
});

test("the HTTP provider surfaces an HTTP error", async () => {
  const fetchImpl: EmbeddingFetch = async () => ({
    ok: false,
    status: 500,
    text: async () => "boom",
    json: async () => null,
  });
  const provider = new HttpEmbeddingProvider({
    baseUrl: "https://example.test/v1",
    apiKey: "k",
    model: "m",
    fetchImpl,
  });
  await assert.rejects(() => provider.embed(["a"]), /HTTP 500/);
});
