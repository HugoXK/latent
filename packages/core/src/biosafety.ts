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

const SELECT_AGENTS = [
  "bacillus anthracis",
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
];

const TOXINS = [
  "ricin",
  "botulinum toxin",
  "tetrodotoxin",
  "saxitoxin",
  "abrin",
  "diphtheria toxin",
];

const ENHANCEMENTS = [
  "increase transmissibility",
  "enhance virulence",
  "gain of function",
  "weaponize",
  "immune evasion",
  "increase lethality",
  "aerosolize",
  "evade immunity",
];

const PATHOGENS = [
  "mycobacterium tuberculosis",
  "salmonella",
  "listeria",
  "pseudomonas aeruginosa",
  "staphylococcus aureus",
  "sars-cov-2",
  "influenza",
  "hepatitis",
];

function matches(text: string, terms: string[]): string[] {
  return terms.filter((term) => text.includes(term));
}

/**
 * A conservative, rule-based first-line screen. It is not a substitute for a
 * biosafety officer: a match refuses the direction, and a human reviews an
 * appeal. The term lists are intentionally explicit so a diff shows every
 * change.
 */
export class RuleBasedBiosafetyClassifier implements BiosafetyClassifier {
  classify(text: string): BiosafetyVerdict {
    const lower = text.toLowerCase();
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
