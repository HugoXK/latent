import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import {
  ModelReconstructionError,
  ModelReconstructor,
  ModelReplayError,
  TemplateReconstructor,
  createReplayFetch,
} from "../src/index.js";
import type { FetchLike } from "../src/index.js";
import type { Fragment } from "@latent/core";

const fragment: Fragment = {
  id: "frg_nonet0001",
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

function forbidNetwork(): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = (() => {
    throw new Error("network access is forbidden in this test");
  }) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

test("no adapter escapes to the network", async () => {
  const restore = forbidNetwork();
  try {
    const template = new TemplateReconstructor();
    const templateOutput = await template.reconstruct({
      fragment,
      verticalId: "igem",
    });
    assert.equal(templateOutput.hypotheses.length, 3);

    await assert.rejects(
      () =>
        new ModelReconstructor({
          baseUrl: "https://example.test",
          apiKey: "k",
          model: "m",
          allowPrivate: false,
        }).reconstruct({ fragment, verticalId: "igem" }),
      (error: unknown) =>
        error instanceof ModelReconstructionError &&
        error.code === "PRIVATE_FRAGMENT_BLOCKED",
    );

    const injected: FetchLike = async () => ({
      ok: true,
      status: 200,
      text: async () => "",
      json: async () => envelope,
    });
    const model = new ModelReconstructor({
      baseUrl: "https://example.test",
      apiKey: "k",
      model: "m",
      allowPrivate: true,
      fetchImpl: injected,
    });
    const modelOutput = await model.reconstruct({
      fragment,
      verticalId: "igem",
    });
    assert.equal(modelOutput.title, "synthetic");

    const sampleDir = fileURLToPath(
      new URL("../../../data/model-replay/", import.meta.url),
    );
    const replay = createReplayFetch({ dir: sampleDir });
    const sampleBody = JSON.stringify({
      model: "replay-model",
      temperature: 0,
      messages: [{ role: "user", content: "hello" }],
    });
    // No fixture is committed: the recorder refuses private and unredacted
    // writes under data/. A miss is the typed error, not a network fallback.
    await assert.rejects(
      () =>
        replay("https://replay.invalid", {
          method: "POST",
          headers: {},
          body: sampleBody,
          signal: new AbortController().signal,
        }),
      (error: unknown) =>
        error instanceof ModelReplayError &&
        error.code === "REPLAY_FIXTURE_MISSING",
    );

    await assert.rejects(
      () =>
        new ModelReconstructor({
          baseUrl: "https://example.test",
          apiKey: "k",
          model: "m",
          allowPrivate: true,
        }).reconstruct({
          fragment: { ...fragment, privacy: "team" },
          verticalId: "igem",
        }),
      /network access is forbidden/,
    );
  } finally {
    restore();
  }
});
