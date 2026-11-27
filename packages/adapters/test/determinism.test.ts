import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import {
  TemplateReconstructor,
  createReplayFetch,
} from "../src/index.js";
import type { Fragment } from "@latent/core";

const fragment: Fragment = {
  id: "frg_determinism1",
  captured_at: "2026-11-27T00:00:00Z",
  kind: "text",
  content: "soil biosensor for heavy metals",
  privacy: "team",
};

const init = {
  method: "POST",
  headers: {},
  body: JSON.stringify({
    model: "replay-model",
    temperature: 0,
    messages: [
      { role: "system", content: "latent replay sample" },
      { role: "user", content: "hello" },
    ],
  }),
  signal: new AbortController().signal,
};

test("the template reconstructor is deterministic", async () => {
  const reconstructor = new TemplateReconstructor();
  const first = await reconstructor.reconstruct({
    fragment,
    verticalId: "igem",
    now: "2026-11-27T00:00:00Z",
  });
  const second = await reconstructor.reconstruct({
    fragment,
    verticalId: "igem",
    now: "2026-11-27T00:00:00Z",
  });
  assert.deepEqual(first, second);
});

test("the replay fetch returns the same fixture without the network", async () => {
  const dir = fileURLToPath(
    new URL("../../../data/model-replay/", import.meta.url),
  );
  const replay = createReplayFetch({ dir });
  const first = await replay("https://replay.invalid", init);
  const second = await replay("https://replay.invalid", init);
  assert.deepEqual(await first.json(), await second.json());
});
