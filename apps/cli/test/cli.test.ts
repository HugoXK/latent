import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

describe("cli", { concurrency: 1 }, () => {
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
  delete env.LATENT_RUNTIME;
  delete env.LATENT_RUNTIME_URL;
  delete env.LATENT_RUNTIME_TOKEN;
  delete env.LATENT_CALLBACK_URL;
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

    const audit = run(["ledger", "audit", ideaId, "--json"]);
    assert.equal(audit.status, 0, audit.stderr);
    const auditData = jsonData(audit) as {
      claims: unknown[];
      validators: Array<{ name: string; status: string }>;
    };
    assert.equal(auditData.validators.length, 4);
    const statuses = Object.fromEntries(
      auditData.validators.map((validator) => [validator.name, validator.status]),
    );
    assert.notEqual(statuses["existence"], "skipped");
    assert.notEqual(statuses["vertical_rules"], "skipped");

    const ledgerMd = run(["ledger", "export", ideaId, "--format", "md"]);
    assert.equal(ledgerMd.status, 0, ledgerMd.stderr);
    assert.match(ledgerMd.stdout, /Sources \(span\)/);

    const noveltyPath = join(tmpdir(), `latent-novelty-${process.pid}.json`);
    const collisionsPath = join(
      tmpdir(),
      `latent-collisions-${process.pid}.json`,
    );
    try {
      writeFileSync(
        noveltyPath,
        JSON.stringify({
          prior_art: [
            {
              id: "pa_1",
              label: "A prior biosensor",
              mechanism: "arsenic-responsive repressor",
              interface: "whole-cell fluorescence",
              host: "E. coli",
              readout: "fluorescence",
              url: "https://example.org/pa_1",
            },
          ],
          candidate: {
            mechanism: "arsenic-responsive repressor",
            interface: "whole-cell fluorescence",
            host: "E. coli",
            readout: "fluorescence",
          },
        }),
      );
      const novelty = run([
        "novelty",
        ideaId,
        "--input",
        noveltyPath,
        "--json",
      ]);
      assert.equal(novelty.status, 0, novelty.stderr);
      const collisions = (
        jsonData(novelty) as {
          collisions: Array<{ source_url: string; claim_ids: string[] }>;
        }
      ).collisions;
      assert.ok(collisions.length >= 1);
      assert.equal(collisions[0]?.source_url, "https://example.org/pa_1");
      assert.ok((collisions[0]?.claim_ids.length ?? 0) >= 1);

      writeFileSync(collisionsPath, JSON.stringify({ collisions }));
      const withCollisions = run([
        "brief",
        ideaId,
        "--collisions",
        collisionsPath,
        "--json",
      ]);
      assert.equal(withCollisions.status, 0, withCollisions.stderr);
      assert.equal(
        (jsonData(withCollisions) as { collision_check: { status: string } })
          .collision_check.status,
        "checked",
      );

      const markdown = run([
        "brief",
        ideaId,
        "--collisions",
        collisionsPath,
        "--format",
        "md",
      ]);
      assert.equal(markdown.status, 0, markdown.stderr);
      assert.match(markdown.stdout, /Novelty and collisions/);
      assert.match(markdown.stdout, /https:\/\/example\.org\/pa_1/);
    } finally {
      rmSync(noveltyPath, { force: true });
      rmSync(collisionsPath, { force: true });
    }

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

    const priors = run(["priors", "--json"]);
    assert.equal(priors.status, 0, priors.stderr);
    const priorData = jsonData(priors) as {
      outcome_sample_count: number;
      questions: Array<{ source: string; sample_count: number }>;
    };
    assert.equal(priorData.outcome_sample_count, 1);
    assert.ok(priorData.questions.length > 0);
    assert.ok(
      priorData.questions.every((question) => question.source === "uniform"),
      "one outcome is not enough to move a prior",
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

test("incubation proposes, reviews and digests within a budget", () => {
  cleanup();
  try {
    const seed = String(
      jsonData(run(["capture", "soil biosensor heavy metals", "--json"])).id,
    );
    jsonData(run(["capture", "soil biosensor for arsenic", "--json"]));
    jsonData(run(["capture", "biosensor heavy metal detection", "--json"]));

    const zero = run(["incubate", seed, "--budget", "0", "--json"]);
    assert.equal(zero.status, 0, zero.stderr);
    const zeroData = jsonData(zero) as { spent: number; suggestions: unknown[] };
    assert.equal(zeroData.spent, 0);
    assert.equal(zeroData.suggestions.length, 0);

    const incubated = run(["incubate", seed, "--budget", "2", "--json"]);
    assert.equal(incubated.status, 0, incubated.stderr);
    const data = jsonData(incubated) as {
      job: { status: string; spent: number; budget: number };
      suggestions: Array<{ id: string; kind: string; to: { id: string } }>;
    };
    assert.equal(data.job.status, "succeeded");
    assert.ok(data.job.spent <= data.job.budget);
    assert.equal(data.suggestions.length, data.job.spent);
    assert.ok(data.suggestions.length >= 1);
    const first = data.suggestions[0];
    assert.ok(first);

    const again = run(["incubate", seed, "--budget", "2", "--json"]);
    assert.equal(again.status, 0, again.stderr);
    assert.equal(
      (jsonData(again) as { suggestions: unknown[] }).suggestions.length,
      0,
    );

    const accepted = run(["suggestion", first.id, "accept", "--json"]);
    assert.equal(accepted.status, 0, accepted.stderr);
    assert.equal((jsonData(accepted) as { status: string }).status, "accepted");

    const listed = run(["suggestions", "--status", "accepted", "--json"]);
    assert.equal(listed.status, 0);
    assert.equal(
      (jsonData(listed) as { suggestions: unknown[] }).suggestions.length,
      1,
    );

    const digest = run(["digest", "--json"]);
    assert.equal(digest.status, 0);
    const digestData = jsonData(digest) as {
      proposed_count: number;
      by_kind: Record<string, number>;
    };
    assert.ok(digestData.proposed_count >= 0);
    assert.ok((digestData.by_kind["connection"] ?? 0) >= 0);

    const revoked = run(["suggestion", first.id, "revoke", "--json"]);
    assert.equal(revoked.status, 0, revoked.stderr);
    assert.equal((jsonData(revoked) as { status: string }).status, "revoked");
  } finally {
    cleanup();
  }
});

test("the research vertical validates, replays and runs the loop", () => {
  cleanup();
  try {
    const replayCase =
      "data/replay/fixtures/valid/research-illustrative-001.json";
    const validated = run(["eval", "validate", replayCase, "--json"]);
    assert.equal(validated.status, 0, validated.stderr);
    assert.equal(
      (jsonData(validated) as { id: string }).id,
      "replay_research-illustrative-001",
    );

    const replay = run(["eval", "replay", replayCase, "--json"]);
    assert.equal(replay.status, 0, replay.stderr);
    assert.equal(
      (jsonData(replay) as { case_id: string }).case_id,
      "replay_research-illustrative-001",
    );

    const fragmentId = String(
      jsonData(
        run(["capture", "a citation-checking replication study", "--json"]),
      ).id,
    );
    const developed = run([
      "develop",
      fragmentId,
      "--vertical",
      "research",
      "--json",
    ]);
    assert.equal(developed.status, 0, developed.stderr);
    const developedData = jsonData(developed) as { id: string; vertical: string };
    assert.equal(developedData.vertical, "research");
    const ideaId = developedData.id;

    for (let i = 0; i < 32; i += 1) {
      const asked = jsonData(run(["ask", ideaId, "--json"])) as {
        ready: boolean;
        question: {
          variable: string;
          options?: Array<{ value: unknown }>;
        } | null;
      };
      if (asked.ready) break;
      assert.ok(asked.question);
      const value = asked.question.options?.[0]?.value ?? "a research plan";
      const answered = run([
        "answer",
        ideaId,
        asked.question.variable,
        String(value),
        "--json",
      ]);
      assert.equal(answered.status, 0, answered.stderr);
    }
    assert.equal(
      (jsonData(run(["ask", ideaId, "--json"])) as { ready: boolean }).ready,
      true,
    );

    assert.equal(run(["confirm", ideaId, "--all", "--json"]).status, 0);
    assert.equal(
      run(["decide", ideaId, "--all", "pass", "--reason", "pilot", "--json"])
        .status,
      0,
    );

    const brief = run(["brief", ideaId, "--json"]);
    assert.equal(brief.status, 0, brief.stderr);
    assert.match(String(jsonData(brief).id), /^brf_/);

    const audit = jsonData(run(["ledger", "audit", ideaId, "--json"])) as {
      validators: Array<{ name: string; status: string }>;
    };
    const statuses = Object.fromEntries(
      audit.validators.map((validator) => [validator.name, validator.status]),
    );
    assert.notEqual(statuses["vertical_rules"], "skipped");
    assert.notEqual(statuses["existence"], "skipped");
  } finally {
    cleanup();
  }
});

test("ingest and retrieve the local evidence corpus", () => {
  cleanup();
  const corpusPath = join(tmpdir(), `latent-corpus-${process.pid}.json`);
  try {
    const empty = run(["retrieve", "anything", "--json"]);
    assert.equal(empty.status, 2);

    writeFileSync(
      corpusPath,
      JSON.stringify({
        documents: [
          {
            id: "doc_arsenic",
            title: "Arsenic whole-cell biosensor",
            url: "https://example.org/arsenic",
            text: "arsenic responsive repressor fluorescence soil field",
            metadata: { village: "Diagnostics", year: 2019 },
          },
          {
            id: "doc_pathogen",
            title: "CRISPR pathogen detection",
            url: "https://example.org/pathogen",
            text: "CRISPR pathogen detection clinical sample",
            metadata: { village: "Diagnostics", year: 2022 },
          },
        ],
      }),
    );

    const ingest = run(["ingest", corpusPath, "--json"]);
    assert.equal(ingest.status, 0, ingest.stderr);
    assert.deepEqual(jsonData(ingest), {
      documents: 2,
      snapshots_added: 2,
      snapshots_cached: 0,
    });

    const retrieval = run([
      "retrieve",
      "arsenic biosensor",
      "--limit",
      "3",
      "--json",
    ]);
    assert.equal(retrieval.status, 0, retrieval.stderr);
    const hits = (jsonData(retrieval) as { hits: Array<{ id: string }> }).hits;
    assert.equal(hits[0]?.id, "doc_arsenic");

    const filtered = run([
      "retrieve",
      "detection",
      "--filter",
      "village=Diagnostics,year=2022",
      "--json",
    ]);
    assert.equal(filtered.status, 0, filtered.stderr);
    assert.deepEqual(
      (jsonData(filtered) as { hits: Array<{ id: string }> }).hits.map(
        (hit) => hit.id,
      ),
      ["doc_pathogen"],
    );
  } finally {
    rmSync(corpusPath, { force: true });
    cleanup();
  }
});

test("the iGEM brief accepts component, timeline and material inputs", () => {
  cleanup();
  // A private directory per test; predictable names in the shared temp dir are
  // an insecure-temp-file finding because another process can pre-create them.
  const inputsDir = mkdtempSync(join(tmpdir(), "latent-igem-inputs-"));
  const componentsPath = join(inputsDir, "components.json");
  const timelinePath = join(inputsDir, "timeline.json");
  const materialPath = join(inputsDir, "material.json");
  try {
    const fragmentId = String(
      jsonData(run(["capture", "arsenic soil biosensor", "--json"])).id,
    );
    const ideaId = String(
      jsonData(run(["develop", fragmentId, "--json"])).id,
    );

    for (let i = 0; i < 32; i += 1) {
      const asked = jsonData(run(["ask", ideaId, "--json"])) as {
        ready: boolean;
        question: {
          variable: string;
          options?: Array<{ value: unknown }>;
        } | null;
      };
      if (asked.ready) break;
      assert.ok(asked.question);
      const value = asked.question.options?.[0]?.value ?? "test";
      const answered = run([
        "answer",
        ideaId,
        asked.question.variable,
        String(value),
        "--json",
      ]);
      assert.equal(answered.status, 0, answered.stderr);
    }
    assert.equal(
      (jsonData(run(["ask", ideaId, "--json"])) as { ready: boolean }).ready,
      true,
    );
    assert.equal(run(["confirm", ideaId, "--all", "--json"]).status, 0);
    assert.equal(
      run(["decide", ideaId, "--all", "pass", "--reason", "pilot", "--json"])
        .status,
      0,
    );

    writeFileSync(
      componentsPath,
      JSON.stringify([
        {
          id: "c1",
          name: "arsR",
          source: "Registry",
          grade: "B",
          length_bp: 800,
        },
      ]),
    );
    writeFileSync(
      timelinePath,
      JSON.stringify({
        tasks: [
          {
            id: "t1",
            name: "build",
            min_weeks: 1,
            likely_weeks: 2,
            max_weeks: 4,
          },
        ],
        calendar: { summer_full_weeks: 10 },
        runs: 200,
        seed: 7,
      }),
    );
    writeFileSync(
      materialPath,
      JSON.stringify({
        target: "product",
        target_amount: 1,
        reactions: [
          { id: "r1", substrates: { glucose: 2 }, products: { product: 1 } },
        ],
        available: { glucose: 10 },
      }),
    );

    const brief = run([
      "brief",
      ideaId,
      "--components",
      componentsPath,
      "--timeline",
      timelinePath,
      "--material",
      materialPath,
      "--json",
    ]);
    assert.equal(brief.status, 0, brief.stderr);
    assert.deepEqual(
      (jsonData(brief) as { sections: Array<{ title: string }> }).sections.map(
        (section) => section.title,
      ),
      ["Components", "Timeline", "Material balance"],
    );
  } finally {
    rmSync(inputsDir, { recursive: true, force: true });
    cleanup();
  }
});
});
