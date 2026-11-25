export type ConstraintSource = "user" | "inferred" | "tool" | "default";

export interface ConstraintVariable {
  value: unknown;
  confidence: number;
  source: ConstraintSource;
  evidence_ref?: string | null;
  updated_at?: string;
}

export interface ConstraintState {
  version: number;
  vertical: string;
  variables: Record<string, ConstraintVariable>;
  unknowns: string[];
  blocking_unknowns: string[];
  updated_at?: string;
  schema_version?: "1.0.0";
}

export interface QuestionOption {
  value: unknown;
  label: string;
  prior?: number;
}

export interface QuestionDefinition {
  id: string;
  variable: string;
  prompt: string;
  options: QuestionOption[];
  blocking?: boolean;
  freeText?: boolean;
}

export class ConstraintError extends Error {
  readonly code = "BLOCKING_CONSTRAINTS";
  readonly variables: string[];

  constructor(variables: string[]) {
    super(`Blocking constraints are unanswered: ${variables.join(", ")}`);
    this.name = "ConstraintError";
    this.variables = variables;
  }
}

export function createConstraintState(
  vertical: string,
  questions: QuestionDefinition[],
  now = new Date().toISOString(),
): ConstraintState {
  const unknowns = Array.from(new Set(questions.map((q) => q.variable)));
  const blocking = Array.from(
    new Set(questions.filter((q) => q.blocking === true).map((q) => q.variable)),
  );
  return {
    version: 1,
    vertical,
    variables: {},
    unknowns,
    blocking_unknowns: blocking,
    updated_at: now,
    schema_version: "1.0.0",
  };
}

export function setConstraintVariable(
  state: ConstraintState,
  variable: string,
  value: unknown,
  source: ConstraintSource = "user",
  confidence = 1,
  now = new Date().toISOString(),
): ConstraintState {
  if (confidence < 0 || confidence > 1) {
    throw new Error("confidence must be between 0 and 1");
  }
  return {
    ...state,
    version: state.version + 1,
    variables: {
      ...state.variables,
      [variable]: { value, confidence, source, updated_at: now },
    },
    unknowns: state.unknowns.filter((u) => u !== variable),
    updated_at: now,
  };
}

export function answerConstraint(
  state: ConstraintState,
  questions: QuestionDefinition[],
  variable: string,
  value: unknown,
  confidence = 1,
  now = new Date().toISOString(),
): ConstraintState {
  const next = setConstraintVariable(state, variable, value, "user", confidence, now);
  return {
    ...next,
    blocking_unknowns: blockingQuestions(next, questions).map((q) => q.variable),
  };
}

export function entropy(weights: number[]): number {
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (total <= 0) return 0;
  let h = 0;
  for (const weight of weights) {
    if (weight <= 0) continue;
    const p = weight / total;
    h -= p * Math.log2(p);
  }
  return h;
}

/**
 * The v0.2 heuristic: discrete entropy over the option priors, discounted by
 * what we already know, with a priority weight for blocking questions. It is
 * deliberately simple and auditable. A calibrated model replaces the priors in
 * v0.3; the interface stays the same.
 */
export function questionInformationGain(
  question: QuestionDefinition,
  state: ConstraintState,
): number {
  const known = state.variables[question.variable];
  const confidence = known?.confidence ?? 0;
  if (confidence >= 0.999) return 0;

  if (question.freeText === true) return 1 - confidence;

  const weights = question.options.map((option) => option.prior ?? 1);
  const base = entropy(weights) * (1 - confidence);
  return question.blocking === true ? base * 3 : base;
}

export function nextQuestion(
  state: ConstraintState,
  questions: QuestionDefinition[],
): QuestionDefinition | null {
  let best: QuestionDefinition | null = null;
  let bestScore = 0;
  for (const question of questions) {
    const score = questionInformationGain(question, state);
    if (score > bestScore) {
      best = question;
      bestScore = score;
    }
  }
  return best;
}

export function blockingQuestions(
  state: ConstraintState,
  questions: QuestionDefinition[],
): QuestionDefinition[] {
  return questions.filter(
    (q) =>
      q.blocking === true &&
      (state.variables[q.variable]?.confidence ?? 0) < 0.6,
  );
}

export function isReadyForVerification(
  state: ConstraintState,
  questions: QuestionDefinition[],
): boolean {
  return blockingQuestions(state, questions).length === 0;
}

export function findQuestion(
  questions: QuestionDefinition[],
  variable: string,
): QuestionDefinition | null {
  return questions.find((q) => q.variable === variable) ?? null;
}

export function constraintSummary(state: ConstraintState): {
  answered: number;
  total: number;
  blocking: string[];
} {
  const total = Array.from(new Set([...state.unknowns, ...Object.keys(state.variables)]))
    .length;
  return {
    answered: Object.keys(state.variables).length,
    total,
    blocking: state.blocking_unknowns,
  };
}
