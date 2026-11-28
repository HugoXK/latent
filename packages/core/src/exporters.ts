import type { Brief, BriefCollision } from "./types.js";

export function exportBriefJson(brief: Brief): string {
  return JSON.stringify(brief, null, 2);
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character] ?? character);
}

export function exportBriefHtml(brief: Brief): string {
  const sections = (brief.sections ?? [])
    .map(
      (section) =>
        `<section><h2>${escapeHtml(section.title)}</h2><pre>${escapeHtml(section.text)}</pre></section>`,
    )
    .join("\n");
  const evidence = brief.evidence
    .map((id) => `<li>${escapeHtml(id)}</li>`)
    .join("");
  const risks = brief.risks
    .map(
      (risk) =>
        `<tr><td>${escapeHtml(risk.risk)}</td><td>${escapeHtml(risk.trigger)}</td><td>${escapeHtml(risk.fallback)}</td></tr>`,
    )
    .join("");
  const collisionCheck = brief.collision_check ?? {
    status: "not_checked" as const,
    note: "The novelty check did not run; this is not a clean result.",
  };
  const collisions = (brief.collisions ?? [])
    .map(
      (collision) =>
        `<tr><td>${escapeHtml(collision.kind)}</td><td>${escapeHtml(collision.prior_label)}</td><td>${escapeHtml(collision.severity)}</td><td>${escapeHtml(collision.note)}</td><td>${escapeHtml((collision.claim_ids ?? []).join(", ") || "—")}</td><td>${escapeHtml(collision.source_url ?? "—")}</td></tr>`,
    )
    .join("");
  const nextSteps = brief.next_steps
    .map((step) => `<li>${escapeHtml(step)}</li>`)
    .join("");
  const unknowns = brief.unknowns
    .map((unknown) => `<li>${escapeHtml(unknown)}</li>`)
    .join("");

  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '  <meta charset="utf-8">',
    `  <title>${escapeHtml(brief.one_liner)}</title>`,
    "</head>",
    "<body>",
    "<article>",
    `  <h1>${escapeHtml(brief.one_liner)}</h1>`,
    `  <p>idea ${escapeHtml(brief.idea_id)} · v${brief.idea_version}</p>`,
    `  <h2>Problem</h2><pre>${escapeHtml(brief.problem.text)}</pre>`,
    `  <h2>Approach</h2><pre>${escapeHtml(brief.approach.text)}</pre>`,
    sections,
    `  <h2>Evidence</h2><ul>${evidence}</ul>`,
    `  <h2>Risks</h2><table><thead><tr><th>Risk</th><th>Trigger</th><th>Fallback</th></tr></thead><tbody>${risks}</tbody></table>`,
    `  <h2>Novelty and collisions</h2><p>Status: <strong>${escapeHtml(collisionCheck.status)}</strong> — ${escapeHtml(collisionCheck.note)}</p>`,
    ...(collisions
      ? [
          `  <table><thead><tr><th>Kind</th><th>Prior</th><th>Severity</th><th>Note</th><th>Claims</th><th>Source</th></tr></thead><tbody>${collisions}</tbody></table>`,
        ]
      : []),
    `  <h2>Next steps</h2><ol>${nextSteps}</ol>`,
    `  <h2>Still unknown</h2><ul>${unknowns}</ul>`,
    "</article>",
    "</body>",
    "</html>",
    "",
  ].join("\n");
}

export interface BriefDiff {
  added_evidence: string[];
  removed_evidence: string[];
  added_unknowns: string[];
  removed_unknowns: string[];
  added_collisions: string[];
  removed_collisions: string[];
  one_liner_changed: boolean;
}

function collisionKey(collision: BriefCollision): string {
  return `${collision.kind}:${collision.prior_id}`;
}

export function diffBriefs(previous: Brief, next: Brief): BriefDiff {
  const previousEvidence = new Set(previous.evidence);
  const nextEvidence = new Set(next.evidence);
  const previousUnknowns = new Set(previous.unknowns);
  const nextUnknowns = new Set(next.unknowns);
  const previousCollisions = new Set(
    (previous.collisions ?? []).map(collisionKey),
  );
  const nextCollisions = new Set((next.collisions ?? []).map(collisionKey));

  return {
    added_evidence: [...nextEvidence].filter((id) => !previousEvidence.has(id)),
    removed_evidence: [...previousEvidence].filter((id) => !nextEvidence.has(id)),
    added_unknowns: [...nextUnknowns].filter((value) => !previousUnknowns.has(value)),
    removed_unknowns: [...previousUnknowns].filter((value) => !nextUnknowns.has(value)),
    added_collisions: [...nextCollisions].filter((key) => !previousCollisions.has(key)),
    removed_collisions: [...previousCollisions].filter((key) => !nextCollisions.has(key)),
    one_liner_changed: previous.one_liner !== next.one_liner,
  };
}

export function renderBriefDiffMarkdown(diff: BriefDiff): string {
  const list = (values: string[]): string =>
    values.length > 0 ? values.map((value) => `- ${value}`).join("\n") : "- none";
  return [
    "# Brief diff",
    "",
    `One-liner changed: ${diff.one_liner_changed}`,
    "",
    "## Evidence added",
    "",
    list(diff.added_evidence),
    "",
    "## Evidence removed",
    "",
    list(diff.removed_evidence),
    "",
    "## Unknowns added",
    "",
    list(diff.added_unknowns),
    "",
    "## Unknowns removed",
    "",
    list(diff.removed_unknowns),
    "",
    "## Collisions added",
    "",
    list(diff.added_collisions),
    "",
    "## Collisions removed",
    "",
    list(diff.removed_collisions),
    "",
  ].join("\n");
}
