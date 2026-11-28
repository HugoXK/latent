import test from "node:test";
import assert from "node:assert/strict";
import {
  TimelineError,
  simulateTimeline,
  timelineGate,
} from "../src/index.js";
import type { TimelineTask } from "../src/index.js";

function task(
  id: string,
  min: number,
  likely: number,
  max: number,
  depends_on?: string[],
): TimelineTask {
  return { id, name: id, min_weeks: min, likely_weeks: likely, max_weeks: max, depends_on };
}

test("a short chain fits the calendar with high probability", () => {
  const result = simulateTimeline({
    tasks: [task("design", 1, 2, 3), task("build", 1, 2, 3, ["design"])],
    calendar: { summer_full_weeks: 8 },
    runs: 500,
    seed: 42,
  });
  assert.ok(result.p50_weeks > 0);
  assert.ok(result.probability_within_8_weeks > 0.8);
  assert.ok(result.bottleneck_tasks.length > 0);
  assert.equal(timelineGate(result).status, "pass");
});

test("a task that cannot fit fails the gate", () => {
  const result = simulateTimeline({
    tasks: [task("build", 10, 12, 14)],
    calendar: { summer_full_weeks: 4 },
    runs: 500,
    seed: 7,
  });
  assert.equal(result.probability_within_available, 0);
  assert.equal(timelineGate(result).status, "fail");
});

test("a dependency cycle is rejected", () => {
  assert.throws(
    () =>
      simulateTimeline({
        tasks: [task("a", 1, 2, 3, ["b"]), task("b", 1, 2, 3, ["a"])],
        calendar: { summer_full_weeks: 8 },
      }),
    (error: unknown) => error instanceof TimelineError,
  );
});

test("the same seed produces the same result", () => {
  const input = {
    tasks: [task("a", 1, 2, 3), task("b", 2, 3, 4, ["a"])],
    calendar: { summer_full_weeks: 8 },
    runs: 200,
    seed: 99,
  };
  assert.deepEqual(simulateTimeline(input), simulateTimeline(input));
});
