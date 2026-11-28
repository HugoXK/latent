import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
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

test("eval validate accepts a valid replay case and reports a leak", () => {
  try {
    const valid = run([
      "eval",
      "validate",
      "data/replay/fixtures/valid/igem-illustrative-001.json",
    ]);
    assert.equal(valid.status, 0, valid.stderr);
    const parsed = JSON.parse(valid.stdout) as {
      ok: boolean;
      id: string;
      illustrative: boolean;
    };
    assert.equal(parsed.ok, true);
    assert.equal(parsed.id, "replay_igem-illustrative-001");
    assert.equal(parsed.illustrative, true);

    const invalid = run([
      "eval",
      "validate",
      "data/replay/fixtures/invalid/leak-seed.json",
    ]);
    assert.equal(invalid.status, 1, invalid.stderr);
    const result = JSON.parse(invalid.stdout) as {
      ok: boolean;
      issues: Array<{ code: string }>;
    };
    assert.equal(result.ok, false);
    assert.ok(result.issues.some((issue) => issue.code === "SEED_LEAK"));
  } finally {
    cleanup();
  }
});

test("eval replay runs the harness on a valid case", () => {
  try {
    const result = run([
      "eval",
      "replay",
      "data/replay/fixtures/valid/igem-illustrative-001.json",
    ]);
    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout) as {
      case_id: string;
      candidate: { seed_found: boolean };
      passed: boolean;
    };
    assert.equal(parsed.case_id, "replay_igem-illustrative-001");
    assert.equal(typeof parsed.candidate.seed_found, "boolean");
  } finally {
    cleanup();
  }
});

test("capture -> develop -> confirm -> decide -> brief", () => {
  try {
    const capture = run(["capture", "soil biosensor for heavy metals"]);
    assert.equal(capture.status, 0, capture.stderr);
    const fragment = JSON.parse(capture.stdout) as { id: string };

    const develop = run(["develop", fragment.id]);
    assert.equal(develop.status, 0, develop.stderr);
    const idea = JSON.parse(develop.stdout) as { id: string };

    const ledger = run(["ledger", "export", idea.id]);
    assert.equal(ledger.status, 0, ledger.stderr);
    const firstClaim = JSON.parse(
      ledger.stdout.trim().split("\n")[0] ?? "{}",
    ) as { id?: string };
    assert.ok(firstClaim.id?.startsWith("clm_"));
    const ledgerMarkdown = run([
      "ledger",
      "export",
      idea.id,
      "--format",
      "md",
    ]);
    assert.equal(ledgerMarkdown.status, 0, ledgerMarkdown.stderr);
    assert.match(ledgerMarkdown.stdout, /\| Claim \|/);

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

    const multi = run([
      "answer",
      idea.id,
      "lab.equipment",
      "plate_reader",
      "hplc",
    ]);
    assert.equal(multi.status, 0, multi.stderr);
    const multiValue = JSON.parse(multi.stdout) as { value: unknown };
    assert.deepEqual(multiValue.value, ["plate_reader", "hplc"]);

    const textAnswer = run([
      "answer",
      idea.id,
      "candidate.a",
      "soil biosensor for arsenic",
    ]);
    assert.equal(textAnswer.status, 0, textAnswer.stderr);
    const textValue = JSON.parse(textAnswer.stdout) as { value: unknown };
    assert.equal(textValue.value, "soil biosensor for arsenic");

    const confirm = run(["confirm", idea.id, "--all"]);
    assert.equal(confirm.status, 0, confirm.stderr);

    const decide = run(["decide", idea.id, "--all", "pass", "--reason", "test"]);
    assert.equal(decide.status, 0, decide.stderr);

    const spec = run(["spec", idea.id]);
    assert.equal(spec.status, 0, spec.stderr);
    assert.match(spec.stdout, /## Tests/);
    const specJson = run(["spec", idea.id, "--format", "json"]);
    assert.equal(specJson.status, 0, specJson.stderr);
    const parsedSpec = JSON.parse(specJson.stdout) as { tests: unknown[] };
    assert.ok(parsedSpec.tests.length >= 1);

    const brief = run([
      "brief",
      idea.id,
      "--format",
      "json",
      "--verify",
    ]);
    assert.equal(brief.status, 0, brief.stderr);
    const parsed = JSON.parse(brief.stdout) as {
      unknowns: string[];
      validators: unknown[];
    };
    assert.ok(parsed.unknowns.length >= 1);
    assert.equal(parsed.validators.length, 4);

    const briefHtml = run(["brief", idea.id, "--format", "html"]);
    assert.equal(briefHtml.status, 0, briefHtml.stderr);
    assert.match(briefHtml.stdout, /<!doctype html>/);
  } finally {
    cleanup();
  }
});

test("a select-agent direction is refused by the biosafety screen", () => {
  const captured = run([
    "capture",
    "Bacillus anthracis spore production for aerosol release",
    "--json",
  ]);
  assert.equal(captured.status, 0, captured.stderr);
  const fragmentId = String(
    (JSON.parse(captured.stdout) as { id: string }).id,
  );

  const refused = run(["develop", fragmentId, "--json"]);
  assert.equal(refused.status, 1, refused.stderr);
  assert.equal(refused.stdout, "", "a refused develop writes nothing to stdout");
  assert.match(refused.stderr, /biosafety review is required/i);
  assert.equal(
    /anthracis/i.test(refused.stderr),
    false,
    `the refusal must not echo the matched term: ${refused.stderr}`,
  );

  const db = new DatabaseSync(dbPath);
  try {
    const audit = db
      .prepare(
        "SELECT COUNT(*) AS n FROM events WHERE type = 'biosafety.refused' AND subject = ?",
      )
      .get(fragmentId) as { n: number };
    assert.equal(audit.n, 1, "the refusal is recorded once");
    const developed = db
      .prepare("SELECT COUNT(*) AS n FROM events WHERE type = 'idea.developed'")
      .get() as { n: number };
    assert.equal(developed.n, 0, "a refused develop creates no idea");
  } finally {
    db.close();
  }
});
