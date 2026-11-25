import type { Idea, IdeaStatus } from "./types.js";

const ALLOWED: Record<IdeaStatus, readonly IdeaStatus[]> = {
  fragment: ["developed"],
  developed: ["incubating", "verifying", "parked", "killed"],
  incubating: ["verifying", "parked", "killed"],
  verifying: ["viable", "parked", "killed"],
  viable: ["briefed", "parked", "killed"],
  briefed: ["learned"],
  learned: [],
  parked: ["developed", "verifying", "killed"],
  killed: [],
};

export class TransitionError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "TransitionError";
    this.code = code;
  }
}

export function canTransition(from: IdeaStatus, to: IdeaStatus): boolean {
  return ALLOWED[from].includes(to);
}

export function transition(
  idea: Idea,
  to: IdeaStatus,
  now = new Date().toISOString(),
): Idea {
  if (!canTransition(idea.status, to)) {
    throw new TransitionError(
      "ILLEGAL_TRANSITION",
      `Cannot move from ${idea.status} to ${to}`,
    );
  }
  if (to === "developed" && idea.hypotheses.length === 0) {
    throw new TransitionError(
      "NO_HYPOTHESES",
      "A developed idea needs at least one hypothesis.",
    );
  }
  if (to === "verifying") {
    const blocking = idea.assumptions.filter(
      (a) => a.risk === "high" && a.status === "unconfirmed",
    );
    if (blocking.length > 0) {
      throw new TransitionError(
        "BLOCKING_ASSUMPTIONS",
        `Confirm or refute: ${blocking.map((a) => a.id).join(", ")}`,
      );
    }
  }
  return {
    ...idea,
    status: to,
    version: idea.version + 1,
    updated_at: now,
  };
}
