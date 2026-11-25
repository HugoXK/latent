import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../..", import.meta.url));
const cli = join(root, "apps/cli/src/index.ts");
const dbPath = join(tmpdir(), `latent-cli-${process.pid}-${Date.now()}.sqlite`);

function run(args: string[]) {
  return spawnSync(process.execPath, ["--import", "tsx", cli, ...args], {
    cwd: root,
    env: {
      ...process.env,
      LATENT_DB_PATH: dbPath,
      LATENT_RECONSTRUCTOR: "template",
    },
    encoding: "utf8",
  });
}

function cleanup(): void {
  for (const path of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    if (existsSync(path)) rmSync(path, { force: true });
  }
}

test("capture -> develop -> confirm -> decide -> brief", () => {
  try {
    const capture = run(["capture", "soil biosensor for heavy metals"]);
    assert.equal(capture.status, 0, capture.stderr);
    const fragment = JSON.parse(capture.stdout) as { id: string };

    const develop = run(["develop", fragment.id]);
    assert.equal(develop.status, 0, develop.stderr);
    const idea = JSON.parse(develop.stdout) as { id: string };

    const blocked = run(["brief", idea.id]);
    assert.equal(blocked.status, 3, "a brief must be blocked before decisions");

    const ask = run(["ask", idea.id]);
    assert.equal(ask.status, 0, ask.stderr);
    const next = JSON.parse(ask.stdout) as {
      question: { blocking?: boolean } | null;
    };
    assert.equal(next.question?.blocking, true);

    const answers: Array<[string, string]> = [
      ["lab.bsl", "1"],
      ["lab.readers", "plate_reader"],
      ["time.summer_weeks", "6"],
      ["success.metric", "detection_limit"],
    ];
    for (const [variable, value] of answers) {
      const answer = run(["answer", idea.id, variable, value]);
      assert.equal(answer.status, 0, answer.stderr);
    }

    const confirm = run(["confirm", idea.id, "--all"]);
    assert.equal(confirm.status, 0, confirm.stderr);

    const decide = run(["decide", idea.id, "--all", "pass", "--reason", "test"]);
    assert.equal(decide.status, 0, decide.stderr);

    const brief = run(["brief", idea.id, "--format", "json"]);
    assert.equal(brief.status, 0, brief.stderr);
    const parsed = JSON.parse(brief.stdout) as {
      unknowns: string[];
      validators: unknown[];
    };
    assert.ok(parsed.unknowns.length >= 1);
    assert.equal(parsed.validators.length, 4);
  } finally {
    cleanup();
  }
});
