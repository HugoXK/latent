import { questionKind } from "./constraints.js";
import type { ConstraintState, QuestionDefinition } from "./constraints.js";

/**
 * The minimal outcome shape this module needs. The canonical `Outcome` type
 * (with decision, version and confidence snapshot) lands with the outcome
 * primitive; a real outcome is structurally assignable to this interface.
 */
export interface PriorOutcome {
  idea_id: string;
  realised_success: boolean;
}

export interface PriorObservation {
  question_id: string;
  variable: string;
  value: unknown;
  success: boolean;
}

export interface OptionPrior {
  value: unknown;
  label: string;
  prior: number;
  samples: number;
}

export interface QuestionPrior {
  id: string;
  variable: string;
  sample_count: number;
  source: "empirical" | "uniform";
  options: OptionPrior[];
}

export const DEFAULT_MIN_SAMPLES = 5;

/**
 * A canonical, type-tagged key. `JSON.stringify` alone maps `undefined` to the
 * string "undefined", `NaN`/`Infinity` to "null", and object key order to a
 * different key, so two distinct option values could merge their samples.
 */
function valueKey(value: unknown): string {
  return canonicalValue(value);
}

function canonicalValue(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "number") {
    if (Number.isNaN(value)) return "number:NaN";
    if (value === Infinity) return "number:Infinity";
    if (value === -Infinity) return "number:-Infinity";
    return `number:${value}`;
  }
  if (typeof value === "string") return `string:${JSON.stringify(value)}`;
  if (typeof value === "boolean") return `boolean:${String(value)}`;
  if (Array.isArray(value)) {
    return `array:[${value.map(canonicalValue).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `object:{${keys
      .map((key) => `${JSON.stringify(key)}:${canonicalValue(record[key])}`)
      .join(",")}}`;
  }
  return `${typeof value}:${String(value)}`;
}

/**
 * Read the answered variables of ideas that have a realised outcome. Only
 * decided ideas contribute; an idea without an outcome is not evidence.
 */
export function observationsFromOutcomes(
  outcomes: readonly PriorOutcome[],
  states: ReadonlyMap<string, ConstraintState>,
  questions: readonly QuestionDefinition[],
): PriorObservation[] {
  const observations: PriorObservation[] = [];
  for (const outcome of outcomes) {
    const state = states.get(outcome.idea_id);
    if (!state) continue;
    for (const question of questions) {
      // Own-property check: a question variable named __proto__ or constructor
      // must not read Object.prototype and become an observation.
      if (!Object.hasOwn(state.variables, question.variable)) continue;
      const variable = state.variables[question.variable];
      if (!variable) continue;
      observations.push({
        question_id: question.id,
        variable: question.variable,
        value: variable.value,
        success: outcome.realised_success,
      });
    }
  }
  return observations.sort((a, b) =>
    a.question_id.localeCompare(b.question_id),
  );
}

/**
 * Replace the declared option priors with an empirical distribution once a
 * question has enough outcome-backed answers. Below the threshold the prior is
 * uniform; a text question has no option distribution and stays uniform.
 *
 * Add-one smoothing keeps every option positive so information gain stays
 * finite. The sample count is exposed next to the prior.
 */
export function questionPriors(
  questions: readonly QuestionDefinition[],
  observations: readonly PriorObservation[],
  options: { minSamples?: number } = {},
): QuestionPrior[] {
  const minSamples = Math.max(
    1,
    Math.trunc(options.minSamples ?? DEFAULT_MIN_SAMPLES),
  );
  const grouped = new Map<string, PriorObservation[]>();
  for (const observation of observations) {
    const list = grouped.get(observation.question_id);
    if (list) list.push(observation);
    else grouped.set(observation.question_id, [observation]);
  }

  return questions.map((question) => {
    const declared = new Map(
      question.options.map((option) => [valueKey(option.value), option]),
    );
    const relevant = (grouped.get(question.id) ?? []).filter((observation) =>
      declared.has(valueKey(observation.value)),
    );
    const sampleCount = relevant.length;
    const uniform =
      question.options.length === 0 ||
      questionKind(question) === "text" ||
      sampleCount < minSamples;

    if (question.options.length === 0) {
      return {
        id: question.id,
        variable: question.variable,
        sample_count: sampleCount,
        source: "uniform" as const,
        options: [],
      };
    }

    const counts = new Map<string, number>();
    for (const observation of relevant) {
      const key = valueKey(observation.value);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const smoothing = 1;
    const denominator = sampleCount + question.options.length * smoothing;
    const optionPriors: OptionPrior[] = question.options.map((option) => {
      const key = valueKey(option.value);
      const count = counts.get(key) ?? 0;
      return {
        value: option.value,
        label: option.label,
        samples: count,
        prior: uniform
          ? 1 / question.options.length
          : (count + smoothing) / denominator,
      };
    });

    return {
      id: question.id,
      variable: question.variable,
      sample_count: sampleCount,
      source: uniform ? "uniform" : "empirical",
      options: optionPriors,
    };
  });
}
