export interface Reaction {
  id: string;
  substrates: Record<string, number>;
  products: Record<string, number>;
}

export interface MaterialBalanceInput {
  target: string;
  target_amount: number;
  reactions: Reaction[];
  available: Record<string, number>;
}

export interface MaterialBalanceResult {
  feasible: boolean;
  required: Record<string, number>;
  limiting: string[];
  notes: string[];
  theoretical_yield: number | null;
}

/**
 * A reverse stoichiometric balance over a pathway. It is deliberately simple:
 * a substance with no producer is an external input, a cycle is reported rather
 * than guessed, and a second producer is reported rather than chosen silently.
 * The result is the mandatory first check before FBA (a project can die on
 * substrate supply, not on flux).
 */
export class MaterialBalanceError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "MaterialBalanceError";
    this.code = code;
  }
}

/** A substrate name from user-supplied JSON must not hit an object setter. */
const UNSAFE_SUBSTANCE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function assertSafeSubstance(name: string): void {
  if (UNSAFE_SUBSTANCE_KEYS.has(name)) {
    throw new MaterialBalanceError(
      "MATERIAL_UNSAFE_SUBSTANCE",
      `unsafe substance name: ${name}`,
    );
  }
}

export function materialBalance(
  input: MaterialBalanceInput,
): MaterialBalanceResult {
  if (!(input.target_amount > 0)) {
    throw new Error("target_amount must be positive");
  }
  const notes: string[] = [];
  const producers = new Map<string, Reaction>();
  for (const reaction of input.reactions) {
    for (const product of Object.keys(reaction.products)) {
      if (producers.has(product)) {
        notes.push(
          `multiple producers for ${product}; using ${producers.get(product)?.id ?? "the first"}`,
        );
      } else {
        producers.set(product, reaction);
      }
    }
  }

  // A Map has no prototype chain: a substrate name can never reach an object
  // setter. The record is materialised once at the end from validated entries.
  const required = new Map<string, number>();
  const stack = new Set<string>();

  const visit = (substance: string, amount: number): void => {
    assertSafeSubstance(substance);
    if (stack.has(substance)) {
      notes.push(`cycle involving ${substance}; the balance stops there`);
      return;
    }
    const reaction = producers.get(substance);
    if (!reaction) {
      required.set(substance, (required.get(substance) ?? 0) + amount);
      return;
    }
    const productCoefficient = reaction.products[substance] ?? 0;
    if (productCoefficient <= 0) {
      notes.push(`reaction ${reaction.id} does not produce ${substance}`);
      return;
    }
    stack.add(substance);
    for (const [substrate, coefficient] of Object.entries(
      reaction.substrates,
    )) {
      visit(
        substrate,
        (amount * coefficient) / productCoefficient,
      );
    }
    stack.delete(substance);
  };

  visit(input.target, input.target_amount);

  const requiredRecord = Object.assign(
    Object.create(null),
    Object.fromEntries(required),
  ) as Record<string, number>;

  const limiting = Object.entries(requiredRecord)
    .filter(
      ([substance, amount]) =>
        (input.available[substance] ?? 0) < amount,
    )
    .map(([substance]) => substance);

  const yields = Object.entries(requiredRecord)
    .map(
      ([substance, amount]) =>
        (input.available[substance] ?? 0) / amount,
    )
    .filter((value) => Number.isFinite(value) && value >= 0);

  return {
    feasible:
      limiting.length === 0 &&
      !notes.some((note) => note.startsWith("cycle")),
    required: requiredRecord,
    limiting,
    notes,
    theoretical_yield:
      yields.length > 0 ? Math.min(...yields) * input.target_amount : null,
  };
}

export interface FbaInput {
  model: string;
  objective: string;
  reactions?: string[];
}

export interface FbaResult {
  feasible: boolean;
  growth_rate: number;
  objective_value: number;
  notes?: string | null;
}

export interface FbaRunner {
  run(input: FbaInput): Promise<FbaResult>;
}

export interface ProcessRunner {
  run(command: string, args: string[], input: string): Promise<string>;
}

export class FbaError extends Error {
  readonly code = "FBA_FAILED";

  constructor(message: string) {
    super(message);
    this.name = "FbaError";
  }
}

export class FixtureFbaRunner implements FbaRunner {
  constructor(private readonly result: FbaResult) {}

  async run(): Promise<FbaResult> {
    return this.result;
  }
}

export class CobraFbaRunner implements FbaRunner {
  constructor(
    private readonly runner: ProcessRunner,
    private readonly scriptPath: string,
  ) {}

  async run(input: FbaInput): Promise<FbaResult> {
    const output = await this.runner.run(
      "python3",
      [this.scriptPath],
      JSON.stringify(input),
    );
    let parsed: unknown;
    try {
      parsed = JSON.parse(output) as unknown;
    } catch {
      throw new FbaError("the COBRA script returned invalid JSON");
    }
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as FbaResult).feasible !== "boolean" ||
      typeof (parsed as FbaResult).growth_rate !== "number" ||
      typeof (parsed as FbaResult).objective_value !== "number"
    ) {
      throw new FbaError("the COBRA script returned an invalid result");
    }
    return parsed as FbaResult;
  }
}
