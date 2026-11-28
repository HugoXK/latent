import test from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ModelReconstructionError,
  ModelReplayError,
  modelRequestKey,
  isCommittedDataDir,
  reconstructorFromEnv,
  writeModelReplayFixture,
} from "../src/index.js";

// The committed fixture directory. Recording here must be refused for private
// content and for an unredacted fixture: the file name is a deterministic hash
// of the request messages, so it is a content fingerprint of the fragment.
const COMMITTED_DIR = fileURLToPath(
  new URL("../../../data/model-replay/", import.meta.url),
);
const MARKER = "latent-private-probe-token";

const requestBody = JSON.stringify({
  model: "probe-model",
  temperature: 0,
  messages: [{ role: "user", content: MARKER }],
});

const response = {
  choices: [{ message: { content: `${MARKER} output` } }],
};

const fragment = {
  id: "frg_private_probe",
  captured_at: "2026-11-25T00:00:00Z",
  kind: "text" as const,
  content: MARKER,
  privacy: "private" as const,
};

function tmp(): string {
  return mkdtempSync(join(tmpdir(), "latent-model-replay-privacy-"));
}

test("a private fragment never writes a fixture under the committed data dir", () => {
  const dir = join(COMMITTED_DIR, "privacy-probe");
  const target = join(dir, `${modelRequestKey(requestBody)}.json`);
  rmSync(dir, { recursive: true, force: true });
  try {
    assert.throws(
      () =>
        writeModelReplayFixture({
          dir,
          requestBody,
          response,
          redact: [MARKER],
          privacy: "private",
          // Even an explicit per-call opt-in cannot override a committed path.
          allowPrivate: true,
        }),
      (error: unknown) =>
        error instanceof ModelReplayError &&
        error.code === "REPLAY_PRIVATE_IN_COMMITTED_PATH",
    );
    assert.equal(
      existsSync(target),
      false,
      "the private fixture must not exist after the refusal",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a public but unredacted fixture is refused under the committed data dir", () => {
  const dir = join(COMMITTED_DIR, "privacy-probe");
  const target = join(dir, `${modelRequestKey(requestBody)}.json`);
  rmSync(dir, { recursive: true, force: true });
  try {
    assert.throws(
      () =>
        writeModelReplayFixture({
          dir,
          requestBody,
          response,
          privacy: "public",
        }),
      (error: unknown) =>
        error instanceof ModelReplayError &&
        error.code === "REPLAY_UNREDACTED_IN_COMMITTED_PATH",
    );
    assert.equal(existsSync(target), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a private fragment is refused in a scratch dir without an explicit opt-in", () => {
  const dir = tmp();
  try {
    assert.throws(
      () =>
        writeModelReplayFixture({
          dir,
          requestBody,
          response,
          redact: [MARKER],
          privacy: "private",
        }),
      (error: unknown) =>
        error instanceof ModelReplayError &&
        error.code === "REPLAY_PRIVATE_RECORD_DENIED",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an explicit per-call opt-in records a private fixture in a scratch dir", () => {
  const dir = tmp();
  try {
    const path = writeModelReplayFixture({
      dir,
      requestBody,
      response,
      redact: [MARKER],
      privacy: "private",
      allowPrivate: true,
    });
    const raw = readFileSync(path, "utf8");
    assert.ok(!raw.includes(MARKER));
    assert.ok(raw.includes("[redacted]"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the default replay constructor refuses a private fragment", async () => {
  const dir = tmp();
  try {
    const replay = reconstructorFromEnv({
      LATENT_RECONSTRUCTOR: "model",
      LATENT_MODEL_REPLAY: "1",
      LATENT_MODEL_REPLAY_DIR: dir,
      LATENT_MODEL_NAME: "test-model",
      LATENT_MODEL_TEMPERATURE: "0",
    });
    await assert.rejects(
      () => replay.reconstruct({ fragment, verticalId: "igem" }),
      (error: unknown) =>
        error instanceof ModelReconstructionError &&
        error.code === "PRIVATE_FRAGMENT_BLOCKED",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a symlink into the committed data dir counts as committed", () => {
  const dir = mkdtempSync(join(tmpdir(), "latent-symlink-"));
  try {
    const link = join(dir, "data-link");
    symlinkSync(fileURLToPath(new URL("../../../data/", import.meta.url)), link);
    assert.equal(isCommittedDataDir(link), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
