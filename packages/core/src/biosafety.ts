export type BiosafetyCategory =
  | "benign"
  | "select_agent"
  | "pathogen"
  | "toxin"
  | "enhancement";

export interface BiosafetyVerdict {
  allowed: boolean;
  category: BiosafetyCategory;
  bsl: number;
  reason: string;
  matched: string[];
}

export interface BiosafetyClassifier {
  classify(text: string): BiosafetyVerdict;
}

export class BiosafetyError extends Error {
  readonly code = "BIOSAFETY_BLOCKED";
  readonly verdict: BiosafetyVerdict;

  constructor(verdict: BiosafetyVerdict) {
    super(verdict.reason);
    this.name = "BiosafetyError";
    this.verdict = verdict;
  }
}

const SELECT_AGENTS_RAW = [
  "bacillus anthracis",
  "b anthracis",
  "炭疽",
  "anthrax",
  "yersinia pestis",
  "plague",
  "variola",
  "smallpox",
  "francisella tularensis",
  "tularemia",
  "ebola",
  "marburg",
  "lassa",
  "nipah",
  "clostridium botulinum",
  "burkholderia pseudomallei",
  "melioidosis",
  "coxiella burnetii",
  "rickettsia rickettsii",
  "viral hemorrhagic fever",
  "beulenpest",
  "milzbrand",
  "pocken",
  "鼠疫",
  "天花",
  "埃博拉",
  "马尔堡",
  "拉沙",
  "尼帕",
  "兔热病",
  "类鼻疽",
];

const TOXINS_RAW = [
  "ricin",
  "蓖麻毒素",
  "botulinum toxin",
  "tetrodotoxin",
  "saxitoxin",
  "abrin",
  "diphtheria toxin",
  "肉毒毒素",
  "河豚毒素",
];

const ENHANCEMENTS_RAW = [
  "increase transmissibility",
  "enhance transmissibility",
  "enhanced transmissibility",
  "increase virulence",
  "enhance virulence",
  "enhanced virulence",
  "gain of function",
  "gof",
  "weaponize",
  "weaponise",
  "immune evasion",
  "increase lethality",
  "aerosolize",
  "aerosolise",
  "evade immunity",
  "功能获得",
  "增强传播",
  "增强毒力",
  "提高传播力",
];

const PATHOGENS_RAW = [
  "mycobacterium tuberculosis",
  "salmonella",
  "listeria",
  "pseudomonas aeruginosa",
  "staphylococcus aureus",
  "sars-cov-2",
  "influenza",
  "hepatitis",
];

// Confusables that survive NFKD. This is a codepoint table, not a regex
// alternation and not a claim of completeness: Cyrillic lookalikes plus the
// common Greek ones. It is applied to both the input and the term lists.
const CONFUSABLES: Record<string, string> = {
  // Cyrillic
  "\u0430": "a",
  "\u0435": "e",
  "\u043e": "o",
  "\u0440": "p",
  "\u0441": "c",
  "\u0445": "x",
  "\u0443": "y",
  "\u0456": "i",
  "\u0455": "s",
  "\u0458": "j",
  // Greek
  "\u03bf": "o",
  "\u03b1": "a",
  "\u03b5": "e",
  "\u03b9": "i",
  "\u03c1": "p",
  "\u03bd": "v",
  "\u03ba": "k",
  "\u03c4": "t",
  "\u03c5": "u",
  "\u03c7": "x",
};

const INVISIBLES = /[\u00AD\u180E\u200B-\u200F\u2060\uFEFF]/gu;

/**
 * One skeleton used for both the input and the term lists.
 *
 * NFKD + drop combining marks, lowercase, delete the invisible/format class
 * (never map it to a space: that would split a term and let `ba<ZWSP>billus`
 * through), map confusables, then collapse punctuation to a single space.
 */
function skeleton(text: string): string {
  const stripped = text
    .normalize("NFKD")
    .toLowerCase()
    .replace(/\p{Mn}/gu, "")
    .replace(/\p{Cf}/gu, "")
    .replace(INVISIBLES, "");
  const mapped = Array.from(stripped, (ch) => CONFUSABLES[ch] ?? ch).join("");
  return mapped.replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/** Remove spaces: the insertion form (`an thrax`) must still match `anthrax`. */
function compact(text: string): string {
  return text.split(" ").join("");
}

function matches(text: string, terms: string[]): string[] {
  const textCompact = compact(text);
  return terms.filter((term) => {
    if (text.includes(term)) return true;
    const termCompact = compact(term);
    // Compact matching is limited to terms >= 5 characters so short terms
    // (`gof`, 3) cannot match across word boundaries; the consequence is
    // recorded in ADR 0020.
    return termCompact.length >= 5 && textCompact.includes(termCompact);
  });
}

// Normalise every term through the same skeleton. This is what keeps a
// hyphenated term such as `sars-cov-2` alive (`sars cov 2` on both sides).
const SELECT_AGENTS = SELECT_AGENTS_RAW.map(skeleton);
const TOXINS = TOXINS_RAW.map(skeleton);
const ENHANCEMENTS = ENHANCEMENTS_RAW.map(skeleton);
const PATHOGENS = PATHOGENS_RAW.map(skeleton);

/**
 * A conservative, rule-based first-line screen. It is not a substitute for a
 * biosafety officer: a match refuses the direction, and a human reviews an
 * appeal. The term lists are intentionally explicit so a diff shows every
 * change.
 */
export class RuleBasedBiosafetyClassifier implements BiosafetyClassifier {
  classify(text: string): BiosafetyVerdict {
    const lower = skeleton(text);
    const selectAgents = matches(lower, SELECT_AGENTS);
    if (selectAgents.length > 0) {
      return {
        allowed: false,
        category: "select_agent",
        bsl: 3,
        reason:
          "select agent or BSL-3/4 pathogen; a biosafety review is required",
        matched: selectAgents,
      };
    }
    const toxins = matches(lower, TOXINS);
    if (toxins.length > 0) {
      return {
        allowed: false,
        category: "toxin",
        bsl: 2,
        reason: "toxin work requires a biosafety review",
        matched: toxins,
      };
    }
    const enhancements = matches(lower, ENHANCEMENTS);
    if (enhancements.length > 0) {
      return {
        allowed: false,
        category: "enhancement",
        bsl: 3,
        reason: "enhancement language is refused; do not soften it",
        matched: enhancements,
      };
    }
    const pathogens = matches(lower, PATHOGENS);
    if (pathogens.length > 0) {
      return {
        allowed: true,
        category: "pathogen",
        bsl: 2,
        reason: "BSL-2 pathogen; confirm the team's clearance and controls",
        matched: pathogens,
      };
    }
    return {
      allowed: true,
      category: "benign",
      bsl: 1,
      reason: "no select agent, toxin or enhancement term found",
      matched: [],
    };
  }
}

export interface BiosafetyGateInput {
  text: string;
  team_bsl: number;
  classifier?: BiosafetyClassifier;
}

export interface BiosafetyGateResult {
  pass: boolean;
  verdict: BiosafetyVerdict;
  reason: string;
}

export function checkBiosafety(
  input: BiosafetyGateInput,
): BiosafetyGateResult {
  const classifier =
    input.classifier ?? new RuleBasedBiosafetyClassifier();
  const verdict = classifier.classify(input.text);
  if (!verdict.allowed) {
    return { pass: false, verdict, reason: verdict.reason };
  }
  if (verdict.bsl > input.team_bsl) {
    return {
      pass: false,
      verdict,
      reason: `requires BSL-${verdict.bsl}; the team has BSL-${input.team_bsl}`,
    };
  }
  return { pass: true, verdict, reason: verdict.reason };
}

export function assertBiosafety(
  input: BiosafetyGateInput,
): BiosafetyGateResult {
  const result = checkBiosafety(input);
  if (!result.pass) throw new BiosafetyError(result.verdict);
  return result;
}
