const FAMILIES = new Map<string, string>([
  ["arsr", "arsenic-responsive-repressor"],
  ["arsenic-repressor", "arsenic-responsive-repressor"],
  ["arsenic-responsive-repressor", "arsenic-responsive-repressor"],
  ["crispr-cas9", "crispr"],
  ["crispr", "crispr"],
  ["whole-cell-reporter", "whole-cell-biosensor"],
  ["whole-cell-biosensor", "whole-cell-biosensor"],
]);

function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

export function mechanismFamily(value: string): string {
  const normalized = normalize(value);
  return FAMILIES.get(normalized) ?? normalized;
}

export interface CanonicalTuple {
  mechanism: string;
  interface: string;
  host: string;
  readout: string;
  substrate: string;
}

export function canonicalize(input: {
  mechanism: string;
  interface: string;
  host: string;
  readout: string;
  substrate?: string;
}): CanonicalTuple {
  return {
    mechanism: mechanismFamily(input.mechanism),
    interface: normalize(input.interface),
    host: normalize(input.host),
    readout: normalize(input.readout),
    substrate: input.substrate ? normalize(input.substrate) : "",
  };
}
