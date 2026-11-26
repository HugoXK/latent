export type EvidenceGrade = "A" | "B" | "C";
export type ComponentDecision = "reuse" | "recharacterise" | "build";

export interface ComponentInput {
  id: string;
  name: string;
  source: string;
  grade: EvidenceGrade;
  host?: string;
  function?: string;
  length_bp?: number;
  needs?: string[];
}

export interface ComponentAssessment {
  component: ComponentInput;
  decision: ComponentDecision;
  rationale: string;
  estimated_weeks: number;
  estimated_cost_usd: number;
}

export interface ComponentTable {
  rows: ComponentAssessment[];
  reuse: number;
  recharacterise: number;
  build: number;
  total_weeks: number;
  max_weeks: number;
  total_cost_usd: number;
}

const SYNTHESIS_USD_PER_KB = 100;

function synthesisCost(lengthBp: number): number {
  return Math.max(1, Math.ceil(lengthBp / 1000)) * SYNTHESIS_USD_PER_KB;
}

export function assessComponent(
  component: ComponentInput,
): ComponentAssessment {
  if (component.grade === "A") {
    return {
      component,
      decision: "reuse",
      rationale:
        "peer-reviewed characterisation; verify it in your host, no rebuild",
      estimated_weeks: 1,
      estimated_cost_usd: 0,
    };
  }
  if (component.grade === "B") {
    return {
      component,
      decision: "recharacterise",
      rationale:
        "Registry/wiki data only; re-characterise before relying on it",
      estimated_weeks: 3,
      estimated_cost_usd: 50,
    };
  }
  const length = component.length_bp ?? 0;
  return {
    component,
    decision: "build",
    rationale:
      "sequence only; build it and characterise it from scratch",
    estimated_weeks: 6,
    estimated_cost_usd: synthesisCost(length) + 200,
  };
}

export function componentTable(
  components: ComponentInput[],
): ComponentTable {
  const rows = components.map(assessComponent);
  const counts = { reuse: 0, recharacterise: 0, build: 0 };
  for (const row of rows) counts[row.decision] += 1;
  return {
    rows,
    ...counts,
    total_weeks: rows.reduce((sum, row) => sum + row.estimated_weeks, 0),
    max_weeks: rows.reduce(
      (max, row) => Math.max(max, row.estimated_weeks),
      0,
    ),
    total_cost_usd: rows.reduce(
      (sum, row) => sum + row.estimated_cost_usd,
      0,
    ),
  };
}

export function renderComponentTableMarkdown(table: ComponentTable): string {
  const rows = table.rows
    .map(
      (row) =>
        `| ${row.component.name} | ${row.component.source} | ${row.component.grade} | ${row.decision} | ${row.estimated_weeks} | ${row.estimated_cost_usd} |`,
    )
    .join("\n");
  return [
    "## Components",
    "",
    "| Component | Source | Grade | Decision | Weeks | Cost (USD) |",
    "|---|---|---|---|---|---|",
    rows,
    "",
    `Reuse: ${table.reuse} · Re-characterise: ${table.recharacterise} · Build: ${table.build}`,
    `Total work: ${table.total_weeks} weeks · Critical path (max): ${table.max_weeks} weeks · Cost: ${table.total_cost_usd} USD`,
    "",
  ].join("\n");
}
