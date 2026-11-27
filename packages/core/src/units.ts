import type { Claim } from "./types.js";

export interface Quantity {
  value: number;
  unit: string;
}

export interface NormalizedQuantity {
  value: number;
  unit: string;
  base_value: number;
  base_unit: string;
}

export interface NumericIssue {
  code: string;
  message: string;
}

export interface NumericCheck {
  claim_id: string;
  ok: boolean;
  normalized: NormalizedQuantity | null;
  issues: NumericIssue[];
}

export interface NumericBounds {
  min?: Quantity;
  max?: Quantity;
}

const MASS = new Map<string, number>([
  ["ng", 1e-9],
  ["ug", 1e-6],
  ["mg", 1e-3],
  ["g", 1],
  ["kg", 1e3],
]);

const VOLUME = new Map<string, number>([
  ["nl", 1e-9],
  ["ul", 1e-6],
  ["ml", 1e-3],
  ["dl", 1e-1],
  ["l", 1],
]);

const TIME = new Map<string, number>([
  ["s", 1],
  ["sec", 1],
  ["min", 60],
  ["h", 3600],
  ["hr", 3600],
  ["day", 86400],
]);

function normalizeUnit(unit: string): string {
  return unit
    .trim()
    .toLowerCase()
    .replace(/μ|µ/g, "u")
    .replace(/\s+/g, "");
}

function issue(code: string, message: string): NumericIssue {
  return { code, message };
}

export function normalizeQuantity(
  value: number,
  unit: string,
): { ok: boolean; normalized: NormalizedQuantity | null; issues: NumericIssue[] } {
  const issues: NumericIssue[] = [];
  if (!Number.isFinite(value)) {
    issues.push(issue("INVALID_NUMBER", "quantity value must be finite"));
  }
  if (value < 0) {
    issues.push(issue("NEGATIVE_QUANTITY", "quantity value must not be negative"));
  }
  const normalizedUnit = normalizeUnit(unit);
  if (normalizedUnit === "") {
    issues.push(issue("MISSING_UNIT", "quantity requires a unit"));
    return { ok: false, normalized: null, issues };
  }

  const parts = normalizedUnit.split("/");
  if (parts.length === 1) {
    const simple = parts[0] ?? "";
    const mass = MASS.get(simple);
    if (mass !== undefined) {
      return {
        ok: issues.length === 0,
        normalized: { value, unit, base_value: value * mass, base_unit: "g" },
        issues,
      };
    }
    const volume = VOLUME.get(simple);
    if (volume !== undefined) {
      return {
        ok: issues.length === 0,
        normalized: { value, unit, base_value: value * volume, base_unit: "L" },
        issues,
      };
    }
    const time = TIME.get(simple);
    if (time !== undefined) {
      return {
        ok: issues.length === 0,
        normalized: { value, unit, base_value: value * time, base_unit: "s" },
        issues,
      };
    }
  }

  if (parts.length === 2) {
    const numerator = parts[0] ?? "";
    const denominator = parts[1] ?? "";
    const mass = MASS.get(numerator);
    const volume = VOLUME.get(denominator);
    const time = TIME.get(denominator);
    if (mass !== undefined && volume !== undefined) {
      return {
        ok: issues.length === 0,
        normalized: {
          value,
          unit,
          base_value: (value * mass) / volume,
          base_unit: "g/L",
        },
        issues,
      };
    }
    if (mass !== undefined && time !== undefined) {
      return {
        ok: issues.length === 0,
        normalized: {
          value,
          unit,
          base_value: (value * mass) / time,
          base_unit: "g/s",
        },
        issues,
      };
    }
  }

  issues.push(issue("UNKNOWN_UNIT", `unknown unit: ${unit}`));
  return { ok: false, normalized: null, issues };
}

export function compareQuantities(left: Quantity, right: Quantity): number {
  const a = normalizeQuantity(left.value, left.unit);
  const b = normalizeQuantity(right.value, right.unit);
  if (
    !a.normalized ||
    !b.normalized ||
    a.normalized.base_unit !== b.normalized.base_unit
  ) {
    throw new Error(
      `quantities are not comparable: ${left.unit} and ${right.unit}`,
    );
  }
  return a.normalized.base_value - b.normalized.base_value;
}

export function checkNumericClaim(
  claim: Claim,
  bounds: NumericBounds = {},
): NumericCheck {
  const issues: NumericIssue[] = [];
  if (typeof claim.value !== "number") {
    return { claim_id: claim.id, ok: true, normalized: null, issues };
  }
  if (!claim.unit) {
    issues.push(
      issue("NUMERIC_WITHOUT_UNIT", "a numeric claim needs a unit"),
    );
    return { claim_id: claim.id, ok: false, normalized: null, issues };
  }

  const result = normalizeQuantity(claim.value, claim.unit);
  issues.push(...result.issues);
  const normalized = result.normalized;

  if (normalized && bounds.min) {
    const min = normalizeQuantity(bounds.min.value, bounds.min.unit);
    if (min.normalized?.base_unit === normalized.base_unit) {
      if (normalized.base_value < min.normalized.base_value) {
        issues.push(
          issue(
            "BELOW_MIN",
            `value is below the minimum ${bounds.min.value} ${bounds.min.unit}`,
          ),
        );
      }
    }
  }
  if (normalized && bounds.max) {
    const max = normalizeQuantity(bounds.max.value, bounds.max.unit);
    if (max.normalized?.base_unit === normalized.base_unit) {
      if (normalized.base_value > max.normalized.base_value) {
        issues.push(
          issue(
            "ABOVE_MAX",
            `value is above the maximum ${bounds.max.value} ${bounds.max.unit}`,
          ),
        );
      }
    }
  }

  return {
    claim_id: claim.id,
    ok: issues.length === 0,
    normalized,
    issues,
  };
}
