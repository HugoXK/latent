import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SchemaValidationError, assertValid } from "../src/index.js";
import type { SchemaName } from "../src/index.js";

const FIXTURES = fileURLToPath(
  new URL("../../../data/fixtures/", import.meta.url),
);
const REPLAY = fileURLToPath(
  new URL(
    "../../../data/replay/fixtures/valid/igem-illustrative-001.json",
    import.meta.url,
  ),
);

function fixture(name: string): any {
  return JSON.parse(readFileSync(`${FIXTURES}/${name}`, "utf8")) as any;
}

function replay(): any {
  return JSON.parse(readFileSync(REPLAY, "utf8")) as any;
}

function rejects(schema: SchemaName, value: unknown): void {
  assert.throws(() => assertValid(schema, value), SchemaValidationError);
}

test("every schema rejects a boundary violation", () => {
  const fragment = fixture("fragment/valid.json");
  fragment.content = "";
  rejects("fragment", fragment);

  const fragmentKind = fixture("fragment/valid.json");
  fragmentKind.kind = "audio";
  rejects("fragment", fragmentKind);

  const claim = fixture("claim/valid.json");
  claim.confidence = 1.5;
  rejects("claim", claim);

  const claimStatus = fixture("claim/valid.json");
  claimStatus.status = "maybe";
  rejects("claim", claimStatus);

  const idea = fixture("idea/valid.json");
  idea.hypotheses = [];
  rejects("idea", idea);

  const ideaConfidence = fixture("idea/valid.json");
  ideaConfidence.hypotheses[0].confidence = 2;
  rejects("idea", ideaConfidence);

  const gate = fixture("gate/valid.json");
  gate.falsifier = "";
  rejects("gate", gate);

  const gateFallback = fixture("gate/valid.json");
  gateFallback.fallback = "other";
  rejects("gate", gateFallback);

  const brief = fixture("brief/valid.json");
  brief.unknowns = [];
  rejects("brief", brief);

  const briefSteps = fixture("brief/valid.json");
  briefSteps.next_steps = [];
  rejects("brief", briefSteps);

  const constraint = fixture("constraint-state/valid.json");
  constraint.version = 0;
  rejects("constraint", constraint);

  const constraintConfidence = fixture("constraint-state/valid.json");
  constraintConfidence.variables["lab.bsl"].confidence = 2;
  rejects("constraint", constraintConfidence);

  const edge = fixture("edge/valid.json");
  edge.weight = 2;
  rejects("edge", edge);

  const edgeProvenance = fixture("edge/valid.json");
  edgeProvenance.provenance = "";
  rejects("edge", edgeProvenance);

  const outcome = fixture("outcome/valid.json");
  outcome.predicted_confidence = -1;
  rejects("outcome", outcome);

  const outcomeVersion = fixture("outcome/valid.json");
  outcomeVersion.idea_version = 0;
  rejects("outcome", outcomeVersion);

  const suggestion = fixture("suggestion/valid.json");
  suggestion.score = 2;
  rejects("suggestion", suggestion);

  const suggestionReason = fixture("suggestion/valid.json");
  suggestionReason.reason = "";
  rejects("suggestion", suggestionReason);

  const replayCase = replay();
  replayCase.expected_candidates = [];
  rejects("replayCase", replayCase);

  const replaySeason = replay();
  replaySeason.metadata.season = 2002;
  rejects("replayCase", replaySeason);
});
