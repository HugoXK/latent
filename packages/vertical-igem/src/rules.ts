export interface IgemMedalRules {
  bronze: string[];
  silver: string[];
  gold: string[];
}

export interface IgemRules {
  version: string;
  checked_at: string;
  villages: string[];
  medals: IgemMedalRules;
  special_awards: string[];
  notes: string;
}

/**
 * The 2026 anchors as a versioned config. The competition changes the rules
 * every year; `checked_at` makes a stale copy visible instead of silently
 * authoritative. Re-check competition.igem.org/judging before relying on it.
 */
export const IGEM_2026: IgemRules = {
  version: "2026.1",
  checked_at: "2026-01-01",
  villages: [
    "Bioremediation",
    "Agriculture",
    "Foundational Advance",
    "Art & Design",
    "Therapeutics",
    "Space",
    "Diagnostics",
    "Biomanufacturing",
    "Conservation",
    "Food & Nutrition",
    "Oncology",
    "Infectious Diseases",
    "Fashion & Cosmetics",
    "Climate Crisis",
    "Software & AI",
  ],
  medals: {
    bronze: ["Competition Deliverables", "Project Attributions", "Contribution"],
    silver: ["Engineering Success", "Human Practices"],
    gold: ["three Special Awards"],
  },
  special_awards: [
    "Best Education",
    "Entrepreneurship",
    "Hardware",
    "Inclusivity Award",
    "Integrated Human Practices",
    "Measurement",
    "Model",
    "New Basic Part",
    "New Composite Part",
    "New Improved Part",
    "Part Collection",
    "Alternative Platform",
    "Presentation",
    "Safety and Security",
    "Software",
    "Sustainable Development Impact",
    "Wiki",
  ],
  notes:
    "Rules change yearly. Verify competition.igem.org/judging/* before relying on this config.",
};

export interface RulesFreshness {
  fresh: boolean;
  age_days: number;
  checked_at: string;
}

export class RulesStaleError extends Error {
  readonly rules: IgemRules;

  constructor(rules: IgemRules, ageDays: number) {
    super(
      `iGEM rules ${rules.version} were checked ${ageDays} days ago; re-check the official rules`,
    );
    this.name = "RulesStaleError";
    this.rules = rules;
  }
}

export function rulesFreshness(
  rules: IgemRules,
  now = new Date(),
  maxAgeDays = 365,
): RulesFreshness {
  const checked = new Date(rules.checked_at).getTime();
  const ageDays = Math.floor((now.getTime() - checked) / 86_400_000);
  return {
    fresh: Number.isFinite(ageDays) && ageDays <= maxAgeDays,
    age_days: ageDays,
    checked_at: rules.checked_at,
  };
}

export function assertRulesFresh(
  rules: IgemRules,
  now = new Date(),
  maxAgeDays = 365,
): void {
  const freshness = rulesFreshness(rules, now, maxAgeDays);
  if (!freshness.fresh) {
    throw new RulesStaleError(rules, freshness.age_days);
  }
}
