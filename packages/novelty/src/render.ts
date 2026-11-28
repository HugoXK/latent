import type { CollisionReport } from "./types.js";

export function renderCollisionMarkdown(report: CollisionReport): string {
  const rows =
    report.hits.length > 0
      ? report.hits
          .map(
            (hit) =>
              `| ${hit.kind} | ${hit.prior_label} | ${hit.severity} | ${hit.note} |`,
          )
          .join("\n")
      : "| — | — | — | — |";
  return [
    "## Novelty and collisions",
    "",
    `Verdict: **${report.verdict}**`,
    "",
    report.novelty_argument,
    "",
    "| Kind | Prior | Severity | Note |",
    "|---|---|---|---|",
    rows,
    "",
  ].join("\n");
}
