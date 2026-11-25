import type { Gate, GateDecider, GateStatus } from "./types.js";

export class GateError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "GateError";
    this.code = code;
  }
}

export function decideGate(
  gate: Gate,
  status: GateStatus,
  by: GateDecider,
  reason: string | null = null,
  now = new Date().toISOString(),
): Gate {
  const isHard = gate.hard !== false;

  if (isHard && (status === "pass" || status === "waived") && by !== "human") {
    throw new GateError(
      "HUMAN_REQUIRED",
      `Hard gate ${gate.id} can only be passed or waived by a human.`,
    );
  }

  if (status === "waived" && by !== "human") {
    throw new GateError(
      "HUMAN_REQUIRED",
      `Gate ${gate.id} can only be waived by a human.`,
    );
  }

  if (status === "waived" && (reason === null || reason.trim() === "")) {
    throw new GateError(
      "REASON_REQUIRED",
      `A waived gate needs a reason: ${gate.id}`,
    );
  }

  return {
    ...gate,
    status,
    decided_by: by,
    reason,
    decided_at: now,
  };
}

export function blockingGates(gates: Gate[]): Gate[] {
  return gates.filter(
    (g) => g.hard !== false && (g.status === "fail" || g.status === "unknown"),
  );
}

export function gatesPromote(gates: Gate[]): boolean {
  return blockingGates(gates).length === 0;
}
