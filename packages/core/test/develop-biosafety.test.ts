import test from "node:test";
import assert from "node:assert/strict";
import {
  BiosafetyError,
  answerConstraint,
  createConstraintState,
  develop,
} from "../src/index.js";
import type {
  Fragment,
  Reconstructor,
  VerticalPack,
} from "../src/index.js";

const pack: VerticalPack = {
  id: "test",
  name: "Test vertical",
  biosafety: true,
  variables: ["lab.bsl"],
  questions: [
    {
      id: "q.bsl",
      variable: "lab.bsl",
      prompt: "BSL?",
      options: [
        { value: 1, label: "BSL-1" },
        { value: 2, label: "BSL-2" },
      ],
    },
  ],
  gates: [
    {
      key: "gate",
      name: "Gate",
      criteria: "criterion",
      falsifier: "falsifier",
      fallback: "none",
      hard: true,
    },
  ],
  briefTemplate: "brief",
};

function fragment(content: string): Fragment {
  return {
    id: "frg_biosafety001",
    captured_at: "2026-11-27T00:00:00Z",
    kind: "text",
    content,
    privacy: "private",
  };
}

function fakeReconstructor(calls: { count: number }): Reconstructor {
  return {
    async reconstruct() {
      calls.count += 1;
      return {
        title: "t",
        one_liner: "o",
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
        assumptions: [],
        claims: [],
        open_questions: [],
      };
    },
  };
}

test("a select agent is refused before the reconstructor runs", async () => {
  const calls = { count: 0 };
  await assert.rejects(
    () =>
      develop({
        fragment: fragment(
          "engineer Bacillus anthracis to increase transmissibility",
        ),
        vertical: pack,
        reconstructor: fakeReconstructor(calls),
      }),
    (error: unknown) =>
      error instanceof BiosafetyError &&
      error.verdict.category === "select_agent" &&
      !error.message.includes("Bacillus anthracis"),
  );
  assert.equal(calls.count, 0);
});

test("a benign fragment reaches the reconstructor", async () => {
  const calls = { count: 0 };
  const result = await develop({
    fragment: fragment("soil biosensor for arsenic"),
    vertical: pack,
    reconstructor: fakeReconstructor(calls),
  });
  assert.equal(calls.count, 1);
  assert.equal(result.idea.status, "developed");
});

test("a BSL-2 pathogen fails without BSL-2 clearance and passes with it", async () => {
  const initial = createConstraintState(pack.id, pack.questions);
  const bsl1 = answerConstraint(initial, pack.questions, "lab.bsl", 1);
  await assert.rejects(
    () =>
      develop({
        fragment: fragment("detect salmonella in food"),
        vertical: pack,
        constraint: bsl1,
        reconstructor: fakeReconstructor({ count: 0 }),
      }),
    (error: unknown) =>
      error instanceof BiosafetyError && error.verdict.category === "pathogen",
  );

  const bsl2 = answerConstraint(initial, pack.questions, "lab.bsl", 2);
  const result = await develop({
    fragment: fragment("detect salmonella in food"),
    vertical: pack,
    constraint: bsl2,
    reconstructor: fakeReconstructor({ count: 0 }),
  });
  assert.equal(result.idea.status, "developed");
});

test("a pack without the biosafety flag is unchanged", async () => {
  const calls = { count: 0 };
  const { biosafety: _ignored, ...withoutFlag } = pack;
  const result = await develop({
    fragment: fragment("engineer Bacillus anthracis"),
    vertical: withoutFlag,
    reconstructor: fakeReconstructor(calls),
  });
  assert.equal(calls.count, 1);
  assert.equal(result.idea.status, "developed");
});
