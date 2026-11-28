export interface TimelineTask {
  id: string;
  name: string;
  min_weeks: number;
  likely_weeks: number;
  max_weeks: number;
  depends_on?: string[];
}

export interface CalendarInput {
  summer_full_weeks: number;
  term_weeks?: number;
  term_weekend_hours?: number;
  full_week_hours?: number;
}

export interface TimelineInput {
  tasks: TimelineTask[];
  calendar: CalendarInput;
  runs?: number;
  seed?: number;
}

export interface TimelineResult {
  runs: number;
  available_weeks: number;
  p50_weeks: number;
  p90_weeks: number;
  probability_within_8_weeks: number;
  probability_within_available: number;
  bottleneck_tasks: string[];
}

export class TimelineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimelineError";
  }
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function triangular(
  min: number,
  likely: number,
  max: number,
  sample: number,
): number {
  if (max <= min) return min;
  const split = (likely - min) / (max - min);
  if (sample < split) {
    return min + Math.sqrt(sample * (max - min) * (likely - min));
  }
  return max - Math.sqrt((1 - sample) * (max - min) * (max - likely));
}

function topologicalOrder(
  tasks: TimelineTask[],
  byId: Map<string, TimelineTask>,
): TimelineTask[] {
  const indegree = new Map<string, number>();
  const children = new Map<string, string[]>();
  for (const task of tasks) indegree.set(task.id, 0);
  for (const task of tasks) {
    for (const dependency of task.depends_on ?? []) {
      if (!byId.has(dependency)) {
        throw new TimelineError(`unknown dependency ${dependency}`);
      }
      indegree.set(task.id, (indegree.get(task.id) ?? 0) + 1);
      const list = children.get(dependency) ?? [];
      list.push(task.id);
      children.set(dependency, list);
    }
  }
  const queue = tasks
    .filter((task) => (indegree.get(task.id) ?? 0) === 0)
    .map((task) => task.id);
  const order: TimelineTask[] = [];
  while (queue.length > 0) {
    const id = queue.shift();
    if (id === undefined) break;
    const task = byId.get(id);
    if (task) order.push(task);
    for (const child of children.get(id) ?? []) {
      const next = (indegree.get(child) ?? 0) - 1;
      indegree.set(child, next);
      if (next === 0) queue.push(child);
    }
  }
  if (order.length !== tasks.length) {
    throw new TimelineError("the task graph has a cycle");
  }
  return order;
}

export function simulateTimeline(input: TimelineInput): TimelineResult {
  if (input.tasks.length === 0) {
    throw new TimelineError("at least one task is required");
  }
  const byId = new Map<string, TimelineTask>();
  for (const task of input.tasks) {
    if (byId.has(task.id)) {
      throw new TimelineError(`duplicate task ${task.id}`);
    }
    if (
      ![task.min_weeks, task.likely_weeks, task.max_weeks].every(
        (value) => Number.isFinite(value) && value >= 0,
      ) ||
      task.min_weeks > task.likely_weeks ||
      task.likely_weeks > task.max_weeks
    ) {
      throw new TimelineError(`invalid weeks for ${task.id}`);
    }
    byId.set(task.id, task);
  }
  const order = topologicalOrder(input.tasks, byId);

  const termWeeks = input.calendar.term_weeks ?? 12;
  const weekendHours = input.calendar.term_weekend_hours ?? 8;
  const fullWeekHours = input.calendar.full_week_hours ?? 40;
  const availableWeeks =
    input.calendar.summer_full_weeks +
    (termWeeks * weekendHours) / fullWeekHours;

  const runs = Math.max(1, Math.floor(input.runs ?? 1000));
  const random = mulberry32(input.seed ?? 1);
  const durations: number[] = [];
  const criticalCount = new Map<string, number>();

  for (let run = 0; run < runs; run += 1) {
    const ends = new Map<string, number>();
    for (const task of order) {
      const dependencyEnds = (task.depends_on ?? []).map(
        (dependency) => ends.get(dependency) ?? 0,
      );
      const start = Math.max(0, ...dependencyEnds);
      const duration = triangular(
        task.min_weeks,
        task.likely_weeks,
        task.max_weeks,
        random(),
      );
      ends.set(task.id, start + duration);
    }

    let last = input.tasks[0];
    if (!last) break;
    for (const task of input.tasks) {
      if ((ends.get(task.id) ?? 0) > (ends.get(last.id) ?? 0)) {
        last = task;
      }
    }
    durations.push(ends.get(last.id) ?? 0);

    let current: TimelineTask | null = last;
    while (current) {
      criticalCount.set(
        current.id,
        (criticalCount.get(current.id) ?? 0) + 1,
      );
      let next: TimelineTask | null = null;
      let bestEnd = -1;
      for (const dependency of current.depends_on ?? []) {
        const end = ends.get(dependency) ?? 0;
        if (end > bestEnd) {
          bestEnd = end;
          next = byId.get(dependency) ?? null;
        }
      }
      current = next;
    }
  }

  const sorted = [...durations].sort((left, right) => left - right);
  const percentile = (fraction: number): number =>
    sorted[
      Math.min(
        sorted.length - 1,
        Math.floor(fraction * sorted.length),
      )
    ] ?? 0;

  return {
    runs,
    available_weeks: availableWeeks,
    p50_weeks: percentile(0.5),
    p90_weeks: percentile(0.9),
    probability_within_8_weeks:
      durations.filter((duration) => duration <= 8).length / runs,
    probability_within_available:
      durations.filter((duration) => duration <= availableWeeks).length / runs,
    bottleneck_tasks: [...criticalCount.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 3)
      .map(([id]) => id),
  };
}

export interface TimelineGateOptions {
  minProbability?: number;
}

export interface TimelineGateResult {
  status: "pass" | "fail" | "unknown";
  probability: number;
  reason: string;
}

export function timelineGate(
  result: TimelineResult,
  options: TimelineGateOptions = {},
): TimelineGateResult {
  const minProbability = options.minProbability ?? 0.75;
  const probability = Math.min(
    result.probability_within_8_weeks,
    result.probability_within_available,
  );
  if (probability >= minProbability) {
    return {
      status: "pass",
      probability,
      reason: `an 8-week loop fits the calendar with probability ${probability.toFixed(2)}`,
    };
  }
  if (probability < 0.5) {
    return {
      status: "fail",
      probability,
      reason: `the loop fits with probability ${probability.toFixed(2)}; shrink the scope or change the readout`,
    };
  }
  return {
    status: "unknown",
    probability,
    reason: `the loop fits with probability ${probability.toFixed(2)}; collect more timing data`,
  };
}
