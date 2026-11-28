import test from "node:test";
import assert from "node:assert/strict";
import {
  BiosafetyError,
  RuleBasedBiosafetyClassifier,
  answerConstraint,
  createConstraintState,
  develop,
} from "../src/index.js";
import type {
  DevelopInput,
  Fragment,
  Reconstructor,
  VerticalPack,
} from "../src/index.js";

const pack: VerticalPack = {
  id: "test",
  name: "Test vertical",
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

test("no pack can disable the screen, because the field does not exist", async () => {
  const calls = { count: 0 };
  assert.equal("biosafety" in pack, false);
  await assert.rejects(
    () =>
      develop({
        fragment: fragment("engineer Bacillus anthracis"),
        vertical: pack,
        reconstructor: fakeReconstructor(calls),
      }),
    (error: unknown) =>
      error instanceof BiosafetyError &&
      error.verdict.category === "select_agent",
  );
  assert.equal(calls.count, 0);
});

test("format characters inside a term do not bypass it", async () => {
  const forms = [
    "ba\u200Bcillus anthracis",
    "bacil\u200Blus anthracis",
    "ba\u00ADcillus anthracis",
    "bacillus\u2060 anthracis",
    "\uFEFFbacillus anthracis",
  ];
  for (const text of forms) {
    const calls = { count: 0 };
    await assert.rejects(
      () =>
        develop({
          fragment: fragment(text),
          vertical: pack,
          reconstructor: fakeReconstructor(calls),
        }),
      (error: unknown) => error instanceof BiosafetyError,
      JSON.stringify(text),
    );
    assert.equal(calls.count, 0, JSON.stringify(text));
  }
});

test("abbreviated, hyphenated, fullwidth and homoglyph forms are refused", async () => {
  const forms = [
    "work with B. anthracis",
    "gain-of-function selection",
    "ＧＡＩＮ ＯＦ ＦＵＮＣＴＩＯＮ in the host",
    "Bacilluѕ anthracis (Cyrillic s)",
  ];
  for (const text of forms) {
    const calls = { count: 0 };
    await assert.rejects(
      () =>
        develop({
          fragment: fragment(text),
          vertical: pack,
          reconstructor: fakeReconstructor(calls),
        }),
      (error: unknown) => error instanceof BiosafetyError,
      text,
    );
    assert.equal(calls.count, 0, text);
  }
});

test("insertion and Greek-confusable forms do not bypass", async () => {
  const forms = ["an thrax", "SARS-CoV-2", "sars cov 2", "eb\u03BFla", "smallp\u03BFx"];
  for (const text of forms) {
    const calls = { count: 0 };
    await assert.rejects(
      () =>
        develop({
          fragment: fragment(text),
          vertical: pack,
          reconstructor: fakeReconstructor(calls),
        }),
      (error: unknown) => error instanceof BiosafetyError,
      JSON.stringify(text),
    );
    assert.equal(calls.count, 0, JSON.stringify(text));
  }
});

test("the classifier is not an input a caller can replace", () => {
  const input: DevelopInput = {
    fragment: fragment("soil biosensor"),
    vertical: pack,
    reconstructor: fakeReconstructor({ count: 0 }),
    // @ts-expect-error classifier is not part of the public DevelopInput
    classifier: new RuleBasedBiosafetyClassifier(),
  };
  assert.equal(input.vertical.id, "test");
});

test("non-English select-agent names are refused", async () => {
  for (const text of ["炭疽", "功能获得", "Milzbrand"]) {
    const calls = { count: 0 };
    await assert.rejects(
      () =>
        develop({
          fragment: fragment(text),
          vertical: pack,
          reconstructor: fakeReconstructor(calls),
        }),
      (error: unknown) => error instanceof BiosafetyError,
      text,
    );
    assert.equal(calls.count, 0, text);
  }
});

test("an empty fragment is benign and still reaches the reconstructor", async () => {
  const calls = { count: 0 };
  const result = await develop({
    fragment: fragment(""),
    vertical: pack,
    reconstructor: fakeReconstructor(calls),
  });
  assert.equal(calls.count, 1);
  assert.equal(result.idea.status, "developed");
});

test("an explicit team_bsl lets a pack without lab.bsl do BSL-2 work", async () => {
  const calls = { count: 0 };
  const result = await develop({
    fragment: fragment("detect salmonella in food"),
    vertical: pack,
    team_bsl: 2,
    reconstructor: fakeReconstructor(calls),
  });
  assert.equal(calls.count, 1);
  assert.equal(result.idea.status, "developed");

  await assert.rejects(
    () =>
      develop({
        fragment: fragment("detect salmonella in food"),
        vertical: pack,
        team_bsl: 1,
        reconstructor: fakeReconstructor({ count: 0 }),
      }),
    (error: unknown) =>
      error instanceof BiosafetyError && error.verdict.category === "pathogen",
  );
});

test("without team_bsl the default is 1, so a BSL-2 pathogen is refused", async () => {
  const calls = { count: 0 };
  await assert.rejects(
    () =>
      develop({
        fragment: fragment("detect salmonella in food"),
        vertical: pack,
        reconstructor: fakeReconstructor(calls),
      }),
    (error: unknown) =>
      error instanceof BiosafetyError && error.verdict.category === "pathogen",
  );
  assert.equal(calls.count, 0);
});

test("team_bsl 2 overrides the default and allows BSL-2 pathogen work", async () => {
  const calls = { count: 0 };
  const result = await develop({
    fragment: fragment("detect salmonella in food"),
    vertical: pack,
    team_bsl: 2,
    reconstructor: fakeReconstructor(calls),
  });
  assert.equal(calls.count, 1);
  assert.equal(result.idea.status, "developed");
});

test("lab.bsl is the fallback when team_bsl is absent", async () => {
  const initial = createConstraintState(pack.id, pack.questions);
  const bsl2 = answerConstraint(initial, pack.questions, "lab.bsl", 2);
  const passed = await develop({
    fragment: fragment("detect salmonella in food"),
    vertical: pack,
    constraint: bsl2,
    reconstructor: fakeReconstructor({ count: 0 }),
  });
  assert.equal(passed.idea.status, "developed");

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
});

test("spaced Chinese danger terms are refused before the reconstructor", async () => {
  const forms = ["炭 疽 杆菌研究", "鼠 疫 研究", "蓖 麻 毒 素 检测", "功 能 获 得 实验"];
  for (const text of forms) {
    const calls = { count: 0 };
    await assert.rejects(
      () =>
        develop({
          fragment: fragment(text),
          vertical: pack,
          reconstructor: fakeReconstructor(calls),
        }),
      (error: unknown) => error instanceof BiosafetyError,
      text,
    );
    assert.equal(calls.count, 0, text);
  }
  const benign = { count: 0 };
  const result = await develop({
    fragment: fragment("合成生物学 课程 设计"),
    vertical: pack,
    reconstructor: fakeReconstructor(benign),
  });
  assert.equal(benign.count, 1);
  assert.equal(result.idea.status, "developed");
});
