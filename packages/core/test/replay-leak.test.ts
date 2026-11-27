import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { ReplayCase } from "../src/index.js";

// A case is only blind if the visible input cannot hand the answer to the
// system. The validator scans the fragment, the constraints and prior-art
// title/URL for the exact seed title; this test enforces the fixture policy on
// every field the README calls visible, including a paraphrase that reorders
// the seed title instead of quoting it (#61 post-merge finding).
const VALID_DIR = fileURLToPath(
  new URL("../../../data/replay/fixtures/valid/", import.meta.url),
);

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "in",
  "into",
  "is",
  "its",
  "of",
  "on",
  "the",
  "to",
  "via",
  "with",
]);

function contentTokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .split(/\s+/)
      .filter((token) => token.length > 0 && !STOPWORDS.has(token)),
  );
}

function load(path: string): ReplayCase {
  return JSON.parse(readFileSync(path, "utf8")) as ReplayCase;
}

// Every string the system can read: metadata is visible per the schema and the
// replay README, and so is the prior-art content, not only its title/URL.
function visibleFields(replay: ReplayCase): Array<[string, string]> {
  return [
    ["metadata.title", replay.metadata.title],
    ["fragment.content", replay.fragment.content],
    ["constraints", JSON.stringify(replay.constraints)],
    ...replay.prior_art.flatMap(
      (source, index): Array<[string, string]> => [
        [`prior_art[${index}].title`, source.title],
        [`prior_art[${index}].mechanism`, source.mechanism],
        [`prior_art[${index}].interface`, source.interface],
      ],
    ),
  ];
}

test("no visible field recovers the hidden seed title", () => {
  const files = readdirSync(VALID_DIR)
    .filter((name) => name.endsWith(".json"))
    .sort();
  assert.ok(files.length > 0, "expected at least one valid replay fixture");

  for (const file of files) {
    const replay = load(`${VALID_DIR}/${file}`);
    const seed = contentTokens(replay.outcome.seed_title);
    assert.ok(
      seed.size >= 4,
      `${file}: the seed title needs enough content tokens for this check`,
    );

    for (const [field, text] of visibleFields(replay)) {
      const shared = [...seed].filter((token) => contentTokens(text).has(token));
      assert.ok(
        shared.length < seed.size,
        `${file}: ${field} recovers the hidden seed title (${shared.join(
          ", ",
        )}); keep the visible field neutral instead of paraphrasing the answer`,
      );
    }
  }
});
