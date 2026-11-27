import { compileBrief } from "@latent/core";
import type {
  Brief,
  BriefCollision,
  BriefExtraSection,
  BriefRisk,
  Claim,
  Gate,
  Idea,
} from "@latent/core";
import { componentTable, renderComponentTableMarkdown } from "./components.js";
import type { ComponentInput } from "./components.js";
import { materialBalance } from "./material.js";
import type { MaterialBalanceInput } from "./material.js";
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

  return compileBrief({
    idea: input.idea,
    claims: input.claims,
    gates: input.gates,
    collisions: input.collisions,
    sections,
    extraRisks,
    now: input.now,
  });
}
