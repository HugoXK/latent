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
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    LATENT_DB_PATH: dbPath,
    LATENT_RECONSTRUCTOR: "template",
  };
  delete env.NODE_TEST_CONTEXT;
  delete env.NODE_OPTIONS;
  return spawnSync(process.execPath, ["--import", "tsx", cli, ...args], {
    cwd: root,
    env,
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

function jsonBody(result: ReturnType<typeof run>): Record<string, unknown> {
  return JSON.parse(result.stdout) as Record<string, unknown>;
}

function jsonData(result: ReturnType<typeof run>): Record<string, unknown> {
  return jsonBody(result).data as Record<string, unknown>;
}

test("every command has a parseable --json envelope and stable exit codes", () => {
  cleanup();
  try {
    const help = run(["help", "--json"]);
    assert.equal(help.status, 0);
    const helpBody = jsonBody(help);
    assert.equal(helpBody.ok, true);
    assert.equal(helpBody.command, "help");
    assert.match(
      String((helpBody.data as { help: string }).help),
      /latent outcome/,
    );
    assert.match(
      String((helpBody.data as { help: string }).help),
      /latent calibration/,
    );

    const capture = run(["capture", "soil microbial biosensor", "--json"]);
    assert.equal(capture.status, 0);
    const fragmentId = String(jsonData(capture).id);

    const develop = run(["develop", fragmentId, "--json"]);
    assert.equal(develop.status, 0);
    const ideaId = String(jsonData(develop).id);

    for (let i = 0; i < 32; i += 1) {
      const asked = run(["ask", ideaId, "--json"]);
      assert.equal(asked.status, 0);
      const payload = jsonBody(asked).data as {
        ready: boolean;
        question: {
          variable: string;
          options?: Array<{ value: unknown }>;
        } | null;
      };
      if (payload.ready) break;
      assert.ok(payload.question, "a blocking question must be returned");
      const value = payload.question.options?.[0]?.value ?? "test";
      const answered = run([
        "answer",
        ideaId,
        payload.question.variable,
        String(value),
        "--json",
      ]);
      assert.equal(answered.status, 0, answered.stderr);
    }

    const ready = run(["ask", ideaId, "--json"]);
    assert.equal((jsonData(ready) as { ready: boolean }).ready, true);

    for (const args of [
      ["constraints", ideaId, "--json"],
      ["confirm", ideaId, "--all", "--json"],
      ["decide", ideaId, "--all", "pass", "--reason", "pilot", "--json"],
      ["show", ideaId, "--json"],
      ["ledger", "export", ideaId, "--json"],
      ["memory", "search", "biosensor", "--json"],
      ["memory", "connect", fragmentId, ideaId, "--json"],
      ["memory", "export", "--json"],
    ]) {
      const result = run(args);
      assert.equal(result.status, 0, `${args.join(" ")}: ${result.stderr}`);
      assert.equal(jsonBody(result).ok, true, args.join(" "));
    }

    const connect = run([
      "memory",
      "connect",
      fragmentId,
      ideaId,
      "--json",
    ]);
    assert.equal((jsonData(connect) as { found: boolean }).found, true);

    const brief = run(["brief", ideaId, "--json"]);
    assert.equal(brief.status, 0, brief.stderr);
    assert.match(String(jsonData(brief).id), /^brf_/);

    const spec = run(["spec", ideaId, "--json"]);
    assert.equal(spec.status, 0, spec.stderr);

    const outcome = run([
      "outcome",
      ideaId,
      "tested",
      "--success",
      "--confidence",
      "0.62",
      "--json",
    ]);
    assert.equal(outcome.status, 0, outcome.stderr);
    const record = jsonData(outcome).outcome as {
      realised_success: boolean;
      predicted_confidence: number;
    };
    assert.equal(record.realised_success, true);
    assert.equal(record.predicted_confidence, 0.62);

    const outcomes = run(["outcomes", ideaId, "--json"]);
    assert.equal(outcomes.status, 0);
    assert.equal((jsonData(outcomes).outcomes as unknown[]).length, 1);

    const calibration = run(["calibration", "--json"]);
    assert.equal(calibration.status, 0);
    assert.equal(
      (jsonData(calibration) as { sample_count: number }).sample_count,
      1,
    );

    const blockedFragment = String(
      jsonData(run(["capture", "unanswered idea", "--json"])).id,
    );
    const blockedIdea = String(
      jsonData(run(["develop", blockedFragment, "--json"])).id,
    );
    const blocked = run(["brief", blockedIdea, "--json"]);
    assert.equal(blocked.status, 3);
    const blockedBody = JSON.parse(blocked.stderr) as {
      ok: boolean;
      error: { code: string; details?: unknown };
    };
    assert.equal(blockedBody.ok, false);
    assert.equal(blockedBody.error.code, "BLOCKING_CONSTRAINTS");
    assert.ok(blockedBody.error.details);

    const missing = run(["show", "frg_missing0000", "--json"]);
    assert.equal(missing.status, 2);
    const missingBody = JSON.parse(missing.stderr) as {
      error: { code: string };
    };
    assert.equal(missingBody.error.code, "NOT_FOUND");
  } finally {
    cleanup();
  }
});

test("constraint answers keep history and undo restores the blocking set", () => {
  cleanup();
  try {
    const fragmentId = String(
      jsonData(run(["capture", "history idea", "--json"])).id,
    );
    const ideaId = String(jsonData(run(["develop", fragmentId, "--json"])).id);

    const before = jsonData(run(["constraints", ideaId, "--json"])) as {
      blocking: string[];
      next_question: {
        variable: string;
        options?: Array<{ value: unknown }>;
      } | null;
    };
    assert.ok(before.blocking.length > 0);
    const question = before.next_question;
    assert.ok(question);
    assert.ok(before.blocking.includes(question.variable));
    const value = question.options?.[0]?.value ?? "test";

    const answer = run([
      "answer",
      ideaId,
      question.variable,
      String(value),
      "--json",
    ]);
    assert.equal(answer.status, 0, answer.stderr);
    const after = jsonData(answer) as { blocking: string[] };
    assert.ok(!after.blocking.includes(question.variable));

    const diff = jsonData(
      run(["constraints", "diff", ideaId, "--json"]),
    ) as { changes: Array<{ variable: string; before: unknown; after: unknown }> };
    assert.equal(diff.changes.length, 1);
    assert.equal(diff.changes[0]?.variable, question.variable);
    assert.deepEqual(diff.changes[0]?.after, value);

    const undo = jsonData(run(["constraints", "undo", ideaId, "--json"])) as {
      state: { variables: Record<string, unknown>; version: number };
      blocking: string[];
    };
    assert.equal(undo.state.variables[question.variable], undefined);
    assert.ok(undo.blocking.includes(question.variable));
    assert.ok(undo.state.version >= 1);

    const alias = run(["constraint", "diff", ideaId, "--json"]);
    assert.equal(alias.status, 0, alias.stderr);
    assert.equal(
      (jsonData(alias) as { changes: unknown[] }).changes.length,
      1,
    );
  } finally {
    cleanup();
  }
});
