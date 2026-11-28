import test from "node:test";
import assert from "node:assert/strict";
import {
  BiosafetyError,
  RuleBasedBiosafetyClassifier,
  assertBiosafety,
  checkBiosafety,
} from "../src/index.js";
import type { BiosafetyClassifier } from "../src/index.js";

const classifier = new RuleBasedBiosafetyClassifier();

test("a benign soil biosensor passes", () => {
  const result = checkBiosafety({
    text: "soil microbial biosensor for arsenic",
    team_bsl: 1,
    classifier,
  });
  assert.equal(result.pass, true);
  assert.equal(result.verdict.category, "benign");
});

test("a select agent is refused even with a BSL-3 team", () => {
  const result = checkBiosafety({
    text: "engineer Bacillus anthracis to increase transmissibility",
    team_bsl: 3,
    classifier,
  });
  assert.equal(result.pass, false);
  assert.equal(result.verdict.allowed, false);
  assert.equal(result.verdict.category, "select_agent");
  assert.equal(result.verdict.bsl, 3);
});

test("a toxin is refused", () => {
  const verdict = classifier.classify("ricin detection in water");
  assert.equal(verdict.allowed, false);
  assert.equal(verdict.category, "toxin");
  assert.ok(verdict.matched.includes("ricin"));
});

test("enhancement language is refused", () => {
  const verdict = classifier.classify(
    "gain of function work on a respiratory virus",
  );
  assert.equal(verdict.allowed, false);
  assert.equal(verdict.category, "enhancement");
});

test("a BSL-2 pathogen requires BSL-2 clearance", () => {
  const low = checkBiosafety({
    text: "detect salmonella in food",
    team_bsl: 1,
    classifier,
  });
  assert.equal(low.pass, false);
  const high = checkBiosafety({
    text: "detect salmonella in food",
    team_bsl: 2,
    classifier,
  });
  assert.equal(high.pass, true);
});

test("a custom classifier can test the BSL mismatch path", () => {
  const bsl3: BiosafetyClassifier = {
    classify() {
      return {
        allowed: true,
        category: "pathogen",
        bsl: 3,
        reason: "test",
        matched: [],
      };
    },
  };
  assert.equal(
    checkBiosafety({ text: "x", team_bsl: 1, classifier: bsl3 }).pass,
    false,
  );
  assert.equal(
    checkBiosafety({ text: "x", team_bsl: 3, classifier: bsl3 }).pass,
    true,
  );
});

test("assertBiosafety throws BiosafetyError", () => {
  assert.throws(
    () =>
      assertBiosafety({
        text: "Bacillus anthracis",
        team_bsl: 3,
        classifier,
      }),
    (error: unknown) => error instanceof BiosafetyError,
  );
});

test("spaced non-ASCII select-agent, toxin and enhancement terms are refused", () => {
  const forms = ["炭 疽", "鼠 疫", "天 花", "埃 博 拉", "功 能 获 得", "蓖 麻 毒 素", "炭\u3000疽"];
  for (const text of forms) {
    const verdict = classifier.classify(text);
    assert.equal(verdict.allowed, false, text);
    assert.ok(
      ["select_agent", "toxin", "enhancement"].includes(verdict.category),
      text,
    );
  }
  assert.equal(classifier.classify("炭疽").category, "select_agent");
  assert.equal(classifier.classify("功能获得").category, "enhancement");
});

test("a benign spaced Chinese sentence still passes", () => {
  const verdict = classifier.classify("合成生物学 课程 设计");
  assert.equal(verdict.allowed, true);
});
