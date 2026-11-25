import test from "node:test";
import assert from "node:assert/strict";
import {
  ModelReconstructionError,
  ModelReconstructor,
} from "../src/index.js";
import type { FetchLike } from "../src/index.js";
import { createConstraintState, setConstraintVariable } from "@latent/core";
import type { Fragment } from "@latent/core";

const fragment: Fragment = {
  id: "frg_test0001",
  captured_at: "2026-11-25T00:00:00Z",
  kind: "text",
  content: "soil biosensor for heavy metals",
  privacy: "private",
};

const valid = {
  title: "soil biosensor",
  one_liner: "A soil biosensor for heavy metals.",
  hypotheses: [
    {
      variant: "conservative",
      statement: "Use a characterised whole-cell reporter.",
      confidence: 0.42,
      confidence_basis: "C",
    },
    {
      variant: "ambitious",
      statement: "Change the host and the readout.",
      confidence: 0.28,
      confidence_basis: "C",
    },
    {
      variant: "cross_domain",
      statement: "Borrow an electrochemical readout.",
      confidence: 0.22,
      confidence_basis: "C",
    },
  ],
  assumptions: [
    { statement: "The readout can be quantitative.", risk: "high" },
  ],
  claims: [
    {
      text: "The host is not yet confirmed.",
      status: "unknown",
      confidence: 0.2,
      confidence_basis: "C",
    },
  ],
  open_questions: [
    {
      question: "What is the one measurable number?",
      expected_information_gain: 0.7,
      variable: "success.metric",
    },
  ],
};

function reply(content: string, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => content,
    json: async () => ({ choices: [{ message: { content } }] }),
  };
}

function make(fetchImpl: FetchLike): ModelReconstructor {
  return new ModelReconstructor({
    baseUrl: "https://example.test/v1/",
    apiKey: "test-key",
    model: "test-model",
    fetchImpl,
    timeoutMs: 1000,
  });
}

test("a valid reconstruction is parsed and the base URL is normalised", async () => {
  const urls: string[] = [];
  const model = make(async (url) => {
    urls.push(url);
    return reply(JSON.stringify(valid));
  });
  const out = await model.reconstruct({ fragment, verticalId: "igem" });
  assert.equal(out.hypotheses.length, 3);
  assert.equal(out.claims[0]?.status, "unknown");
  assert.deepEqual(urls, ["https://example.test/v1/chat/completions"]);
});

test("the prompt includes known constraints", async () => {
  let body = "";
  const model = make(async (_url, init) => {
    body = init.body;
    return reply(JSON.stringify(valid));
  });
  const state = setConstraintVariable(
    createConstraintState("igem", []),
    "lab.bsl",
    1,
    "user",
    1,
    "t",
  );
  await model.reconstruct({ fragment, verticalId: "igem", constraints: state });
  const request = JSON.parse(body) as {
    messages: Array<{ role: string; content: string }>;
  };
  const user = request.messages.find((m) => m.role === "user");
  assert.ok(user?.content.includes('"lab.bsl": 1'));
});

test("a code-fenced response is accepted", async () => {
  const model = make(async () => reply("```json\n" + JSON.stringify(valid) + "\n```"));
  const out = await model.reconstruct({ fragment, verticalId: "igem" });
  assert.equal(out.title, "soil biosensor");
});

test("an invalid response is repaired once", async () => {
  let calls = 0;
  const model = make(async () => {
    calls += 1;
    return calls === 1 ? reply("not json") : reply(JSON.stringify(valid));
  });
  const out = await model.reconstruct({ fragment, verticalId: "igem" });
  assert.equal(out.title, "soil biosensor");
  assert.equal(calls, 2);
});

test("a model cannot verify a claim", async () => {
  const bad = {
    ...valid,
    claims: [
      {
        text: "A fabricated fact.",
        status: "verified",
        confidence: 0.9,
        confidence_basis: "C",
      },
    ],
  };
  let calls = 0;
  const model = make(async () => {
    calls += 1;
    return reply(JSON.stringify(bad));
  });
  await assert.rejects(
    () => model.reconstruct({ fragment, verticalId: "igem" }),
    (error: unknown) =>
      error instanceof ModelReconstructionError &&
      error.code === "MODEL_INVALID_OUTPUT",
  );
  assert.equal(calls, 2);
});

test("a model cannot claim a grade other than C", async () => {
  const bad = {
    ...valid,
    hypotheses: valid.hypotheses.map((h) => ({ ...h, confidence_basis: "A" })),
  };
  const model = make(async () => reply(JSON.stringify(bad)));
  await assert.rejects(
    () => model.reconstruct({ fragment, verticalId: "igem" }),
    (error: unknown) =>
      error instanceof ModelReconstructionError &&
      error.code === "MODEL_INVALID_OUTPUT",
  );
});

test("an HTTP error is surfaced", async () => {
  const model = make(async () => reply("boom", 500));
  await assert.rejects(
    () => model.reconstruct({ fragment, verticalId: "igem" }),
    (error: unknown) =>
      error instanceof ModelReconstructionError &&
      error.code === "MODEL_HTTP_ERROR",
  );
});
