import { compileBrief } from "@latent/core";
import type {
  Brief,
  BriefCollision,
  BriefExtraSection,
  BriefRisk,
  BriefValidator,
  BriefValidatorName,
  Claim,
  Gate,
  Idea,
} from "@latent/core";
import { componentTable, renderComponentTableMarkdown } from "./components.js";
import type { ComponentInput } from "./components.js";
import { materialBalance } from "./material.js";
import type { MaterialBalanceInput } from "./material.js";
import { IGEM_2026, rulesFreshness } from "./rules.js";
import { simulateTimeline, timelineGate } from "./timeline.js";
import type { TimelineInput } from "./timeline.js";

export interface IgemBriefInput {
  idea: Idea;
  claims: Claim[];
  gates: Gate[];
  components?: ComponentInput[];
  timeline?: TimelineInput;
  material?: MaterialBalanceInput;
  collisions?: BriefCollision[];
  validators?: Partial<Record<BriefValidatorName, BriefValidator>>;
  strictValidators?: boolean;
  now?: string;
}

/**
 * Compose the generic brief with the iGEM depth: components, timeline and
 * material balance. A failed timeline or material balance becomes a risk, not
 * a hidden sentence; the base compiler still blocks unsupported claims and
 * unknown hard gates.
 */
export function compileIgemBrief(input: IgemBriefInput): Brief {
  const sections: BriefExtraSection[] = [];
  const extraRisks: BriefRisk[] = [];

  if (input.components && input.components.length > 0) {
    sections.push({
      title: "Components",
      text: renderComponentTableMarkdown(componentTable(input.components)).replace(
        /^## Components\s*\n+/,
        "",
      ),
    });
  }

  if (input.timeline) {
    const result = simulateTimeline(input.timeline);
    const gate = timelineGate(result);
    sections.push({
      title: "Timeline",
      text: [
        `p50 ${result.p50_weeks.toFixed(1)} weeks; p90 ${result.p90_weeks.toFixed(1)} weeks`,
        `8-week probability ${(result.probability_within_8_weeks * 100).toFixed(0)}%; calendar ${result.available_weeks.toFixed(1)} weeks`,
        `gate 4: ${gate.status} — ${gate.reason}`,
        `bottlenecks: ${result.bottleneck_tasks.join(", ") || "none"}`,
      ].join("\n"),
    });
    if (gate.status === "fail") {
      extraRisks.push({
        risk: "The DBTL loop does not fit the calendar",
        trigger: `8-week probability ${(result.probability_within_8_weeks * 100).toFixed(0)}%`,
        fallback: "reduce_scope",
      });
    }
  }

  if (input.material) {
    const result = materialBalance(input.material);
    sections.push({
      title: "Material balance",
      text: [
        `feasible: ${result.feasible}`,
        `limiting: ${result.limiting.join(", ") || "none"}`,
        `theoretical yield: ${result.theoretical_yield ?? "unknown"}`,
        `notes: ${result.notes.join("; ") || "none"}`,
      ].join("\n"),
    });
    if (!result.feasible) {
      extraRisks.push({
        risk: "Substrate supply shortfall",
        trigger: result.limiting.join(", ") || "a pathway cycle",
        fallback: "reduce_scope",
      });
    }
  }

  const nowDate = input.now ? new Date(input.now) : new Date();
  const freshness = rulesFreshness(IGEM_2026, nowDate);
  const verticalRules: BriefValidator =
    input.validators?.vertical_rules ?? {
      name: "vertical_rules",
      status: freshness.fresh ? "pass" : "fail",
      detail: `iGEM ${IGEM_2026.version} checked ${freshness.age_days} days ago`,
    };

  return compileBrief({
    idea: input.idea,
    claims: input.claims,
    gates: input.gates,
    collisions: input.collisions,
    sections,
    extraRisks,
    validators: { ...input.validators, vertical_rules: verticalRules },
    strictValidators: input.strictValidators,
    now: input.now,
  });
}
