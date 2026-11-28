import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ModelReconstructor,
  ModelReplayError,
  createReplayFetch,
  modelRequestKey,
  reconstructorFromEnv,
  writeModelReplayFixture,
} from "../src/index.js";
import type { FetchLike } from "../src/index.js";
import type { Fragment } from "@latent/core";

const fragment: Fragment = {
  id: "frg_replay0001",
  captured_at: "2026-11-25T00:00:00Z",
  kind: "text",
  content: "soil biosensor for heavy metals",
  privacy: "private",
};

const reconstruction = {
  title: "synthetic",
  one_liner: "synthetic",
  hypotheses: [
    {
      variant: "conservative",
      statement: "s1",
      confidence: 0.4,
      confidence_basis: "C",
    },
    {
      variant: "ambitious",
      statement: "s2",
      confidence: 0.3,
      confidence_basis: "C",
    },
    {
      variant: "cross_domain",
      statement: "s3",
      confidence: 0.2,
      confidence_basis: "C",
    },
  ],
  assumptions: [{ statement: "a", risk: "high" }],
  claims: [
    {
      text: "c",
      status: "unknown",
      confidence: 0.2,
      confidence_basis: "C",
    },
  ],
  open_questions: [
    { question: "q", expected_information_gain: 0.5, variable: "v" },
  ],
};

const envelope = {
  choices: [{ message: { content: JSON.stringify(reconstruction) } }],
};

function tmp(): string {
  return mkdtempSync(join(tmpdir(), "latent-model-replay-"));
}

test("the request key is stable and sensitive to temperature", () => {
  const a = modelRequestKey(
    JSON.stringify({
      model: "m",
      temperature: 0,
      messages: [{ role: "user", content: "x" }],
    }),
  );
  const b = modelRequestKey(
    JSON.stringify({
      messages: [{ content: "x", role: "user" }],
      temperature: 0,
      model: "m",
    }),
  );
  const c = modelRequestKey(
    JSON.stringify({
      model: "m",
      temperature: 1,
      messages: [{ role: "user", content: "x" }],
    }),
  );
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test("a missing fixture is a typed error and makes no network call", async () => {
  const dir = tmp();
  try {
    const fetchImpl = createReplayFetch({ dir });
    await assert.rejects(
      () =>
        fetchImpl("https://replay.invalid/v1/chat/completions", {
          method: "POST",
          headers: {},
          body: JSON.stringify({ model: "m", messages: [] }),
          signal: new AbortController().signal,
        }),
      (error: unknown) =>
        error instanceof ModelReplayError &&
        error.code === "REPLAY_FIXTURE_MISSING",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a recorded fixture is redacted and replayed", async () => {
  const dir = tmp();
  try {
    const body = JSON.stringify({
      model: "m",
      temperature: 0,
      messages: [{ role: "user", content: "secret" }],
    });
    const response = {
      choices: [{ message: { content: "secret output" } }],
    };
    const path = writeModelReplayFixture({
      dir,
      requestBody: body,
      response,
      redact: ["secret"],
      privacy: "public",
    });
    const raw = readFileSync(path, "utf8");
    assert.ok(!raw.includes("secret"));
    assert.ok(raw.includes("[redacted]"));
    const fetchImpl = createReplayFetch({ dir });
    const result = await fetchImpl("https://replay.invalid", {
      method: "POST",
      headers: {},
      body,
      signal: new AbortController().signal,
    });
    const json = (await result.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    assert.equal(json.choices[0]?.message.content, "[redacted] output");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("LATENT_MODEL_REPLAY replays the adapter without a network", async () => {
  const dir = tmp();
  try {
    let captured = "";
    const capture: FetchLike = async (_url, init) => {
      captured = init.body;
      return {
        ok: true,
        status: 200,
        text: async () => "",
        json: async () => envelope,
      };
    };
    const source = new ModelReconstructor({
      baseUrl: "https://example.test/v1",
      apiKey: "k",
      model: "test-model",
      temperature: 0,
      jsonMode: true,
      allowPrivate: true,
      fetchImpl: capture,
    });
    const first = await source.reconstruct({ fragment, verticalId: "igem" });
    writeModelReplayFixture({
      dir,
      requestBody: captured,
      response: envelope,
      privacy: "public",
    });

    const replay = reconstructorFromEnv({
      LATENT_RECONSTRUCTOR: "model",
      LATENT_MODEL_REPLAY: "1",
      LATENT_MODEL_REPLAY_DIR: dir,
      LATENT_MODEL_NAME: "test-model",
      LATENT_MODEL_TEMPERATURE: "0",
      LATENT_MODEL_JSON_MODE: "true",
    });
    // The replay path no longer accepts private fragments by default.
    const second = await replay.reconstruct({
      fragment: { ...fragment, privacy: "public" },
      verticalId: "igem",
    });
    assert.equal(second.title, first.title);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a fixture without a response envelope is a typed error", async () => {
  const dir = mkdtempSync(join(tmpdir(), "latent-replay-invalid-"));
  try {
    const body = JSON.stringify({
      model: "m",
      temperature: 0,
      messages: [{ role: "user", content: "x" }],
    });
    const key = modelRequestKey(body);
    writeFileSync(join(dir, `${key}.json`), JSON.stringify({ response: null }));
    const fetchImpl = createReplayFetch({ dir });
    await assert.rejects(
      () =>
        fetchImpl("https://replay.invalid", {
          method: "POST",
          headers: {},
          body,
          signal: new AbortController().signal,
        }),
      (error: unknown) =>
        error instanceof ModelReplayError &&
        error.code === "REPLAY_FIXTURE_INVALID",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
