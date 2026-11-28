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
  // Single linear pass over code points: a quantified negated class over the
  // whole input is a polynomial-ReDoS sink (CodeQL js/polynomial-redos).
  const letters = /[\p{L}\p{N}]/u;
  let out = "";
  let separator = false;
  for (const char of value.trim().toLowerCase()) {
    if (letters.test(char)) {
      if (separator && out.length > 0) out += "-";
      out += char;
      separator = false;
    } else {
      separator = true;
    }
  }
  return out;
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
