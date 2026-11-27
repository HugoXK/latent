import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ErrorObject, ValidateFunction } from "ajv";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

/**
 * The schemas are canonical. Runtime validation happens at the store boundary
 * so a hand-written TypeScript type cannot drift silently from the contract.
 *
 * This loader reads `data/schemas/` from the repository. A packaged build must
 * copy the schemas into the package; that is a v0.3 packaging task.
 */
const SCHEMA_DIR = fileURLToPath(
  new URL("../../../data/schemas/", import.meta.url),
);

function load(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(SCHEMA_DIR, name), "utf8")) as Record<
    string,
    unknown
  >;
}

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

const SCHEMA_FILES = {
  fragment: "fragment.schema.json",
  constraint: "constraint-state.schema.json",
  claim: "claim.schema.json",
  idea: "idea.schema.json",
  gate: "gate.schema.json",
  brief: "brief.schema.json",
  edge: "edge.schema.json",
  outcome: "outcome.schema.json",
  replayCase: "replay-case.schema.json",
} as const;

// Register every schema first so a cross-schema `$ref` (replay-case refers to
// constraint-state and fragment by `$id`) resolves when each validator compiles.
for (const file of Object.values(SCHEMA_FILES)) {
  ajv.addSchema(load(file));
}

function getValidator(file: string): ValidateFunction {
  const id = `https://latent.dev/schemas/${file}`;
  const validator = ajv.getSchema(id);
  if (!validator) throw new Error(`schema not found: ${id}`);
  return validator;
}

const validators = {
  fragment: getValidator(SCHEMA_FILES.fragment),
  constraint: getValidator(SCHEMA_FILES.constraint),
  claim: getValidator(SCHEMA_FILES.claim),
  idea: getValidator(SCHEMA_FILES.idea),
  gate: getValidator(SCHEMA_FILES.gate),
  brief: getValidator(SCHEMA_FILES.brief),
  edge: getValidator(SCHEMA_FILES.edge),
  outcome: getValidator(SCHEMA_FILES.outcome),
  replayCase: getValidator(SCHEMA_FILES.replayCase),
} satisfies Record<string, ValidateFunction>;

export type SchemaName = keyof typeof validators;

export class SchemaValidationError extends Error {
  readonly schema: SchemaName;
  readonly errors: ErrorObject[];

  constructor(schema: SchemaName, errors: ErrorObject[] | null | undefined) {
    const detail = (errors ?? [])
      .map((e) => `${e.instancePath || "/"} ${e.message ?? "invalid"}`)
      .join("; ");
    super(`${schema} failed schema validation: ${detail}`);
    this.name = "SchemaValidationError";
    this.schema = schema;
    this.errors = errors ?? [];
  }
}

export function assertValid(schema: SchemaName, value: unknown): void {
  const validate = validators[schema];
  if (!validate(value)) {
    throw new SchemaValidationError(schema, validate.errors);
  }
}

export function isValid(schema: SchemaName, value: unknown): boolean {
  return validators[schema](value) as boolean;
}
