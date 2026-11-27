import { questionKind } from "./constraints.js";
import type { VerticalPack } from "./vertical.js";

export interface PackIssue {
  code: string;
  path: string;
  message: string;
}

const FALLBACKS = new Set([
  "change_readout",
  "change_host",
  "reduce_scope",
  "compute_only",
  "none",
]);

export class PackValidationError extends Error {
  readonly issues: PackIssue[];

  constructor(issues: PackIssue[]) {
    super(
      `vertical pack failed validation: ${issues
        .map((issue) => `${issue.code} at ${issue.path}`)
        .join("; ")}`,
    );
    this.name = "PackValidationError";
    this.issues = issues;
  }
}

export function validateVerticalPack(pack: VerticalPack): PackIssue[] {
  const issues: PackIssue[] = [];
  if (!pack.id?.trim()) {
    issues.push({ code: "MISSING_ID", path: "/id", message: "id is required" });
  }
  if (!pack.name?.trim()) {
    issues.push({
      code: "MISSING_NAME",
      path: "/name",
      message: "name is required",
    });
  }
  if (!pack.briefTemplate?.trim()) {
    issues.push({
      code: "MISSING_TEMPLATE",
      path: "/briefTemplate",
      message: "briefTemplate is required",
    });
  }

  const variables = new Set(pack.variables);
  if (variables.size !== pack.variables.length) {
    issues.push({
      code: "DUPLICATE_VARIABLE",
      path: "/variables",
      message: "variable names must be unique",
    });
  }

  const questionIds = new Set<string>();
  const questionVariables = new Set<string>();
  for (const [index, question] of pack.questions.entries()) {
    const path = `/questions/${index}`;
    if (questionIds.has(question.id)) {
      issues.push({
        code: "DUPLICATE_QUESTION_ID",
        path: `${path}/id`,
        message: `duplicate question id ${question.id}`,
      });
    }
    questionIds.add(question.id);
    if (questionVariables.has(question.variable)) {
      issues.push({
        code: "DUPLICATE_QUESTION_VARIABLE",
        path: `${path}/variable`,
        message: `duplicate question variable ${question.variable}`,
      });
    }
    questionVariables.add(question.variable);
    if (!variables.has(question.variable)) {
      issues.push({
        code: "UNKNOWN_VARIABLE",
        path: `${path}/variable`,
        message: `${question.variable} is not declared in variables`,
      });
    }

    const kind = questionKind(question);
    if (kind !== "text" && question.options.length === 0) {
      issues.push({
        code: "NO_OPTIONS",
        path: `${path}/options`,
        message: "a single or multi question needs options",
      });
    }
    const optionValues = new Set(
      question.options.map((option) => JSON.stringify(option.value)),
    );
    if (optionValues.size !== question.options.length) {
      issues.push({
        code: "DUPLICATE_OPTION",
        path: `${path}/options`,
        message: "option values must be unique",
      });
    }
    for (const [optionIndex, option] of question.options.entries()) {
      if (!option.label?.trim()) {
        issues.push({
          code: "MISSING_OPTION_LABEL",
          path: `${path}/options/${optionIndex}/label`,
          message: "option label is required",
        });
      }
    }
    for (const [dependencyIndex, dependency] of (
      question.dependsOn ?? []
    ).entries()) {
      if (!variables.has(dependency.variable)) {
        issues.push({
          code: "UNKNOWN_DEPENDENCY",
          path: `${path}/dependsOn/${dependencyIndex}/variable`,
          message: `${dependency.variable} is not declared in variables`,
        });
      }
      const source = pack.questions.find(
        (candidate) => candidate.variable === dependency.variable,
      );
      if (
        source &&
        source.options.length > 0 &&
        !source.options.some((option) => Object.is(option.value, dependency.equals))
      ) {
        issues.push({
          code: "DEPENDENCY_VALUE",
          path: `${path}/dependsOn/${dependencyIndex}/equals`,
          message: `${dependency.variable} has no option ${JSON.stringify(dependency.equals)}`,
        });
      }
    }
  }

  if (pack.gates.length === 0) {
    issues.push({
      code: "NO_GATES",
      path: "/gates",
      message: "at least one gate is required",
    });
  }
  const gateKeys = new Set<string>();
  for (const [index, gate] of pack.gates.entries()) {
    const path = `/gates/${index}`;
    if (gateKeys.has(gate.key)) {
      issues.push({
        code: "DUPLICATE_GATE",
        path: `${path}/key`,
        message: `duplicate gate key ${gate.key}`,
      });
    }
    gateKeys.add(gate.key);
    if (!gate.name?.trim() || !gate.criteria?.trim() || !gate.falsifier?.trim()) {
      issues.push({
        code: "INCOMPLETE_GATE",
        path,
        message: "a gate needs a name, criteria and falsifier",
      });
    }
    if (!FALLBACKS.has(gate.fallback)) {
      issues.push({
        code: "BAD_FALLBACK",
        path: `${path}/fallback`,
        message: `unknown fallback ${gate.fallback}`,
      });
    }
  }

  return issues;
}

export function assertValidPack(pack: VerticalPack): void {
  const issues = validateVerticalPack(pack);
  if (issues.length > 0) throw new PackValidationError(issues);
}
