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

const validators = {
  fragment: ajv.compile(load("fragment.schema.json")),
  constraint: ajv.compile(load("constraint-state.schema.json")),
  claim: ajv.compile(load("claim.schema.json")),
  idea: ajv.compile(load("idea.schema.json")),
  gate: ajv.compile(load("gate.schema.json")),
  brief: ajv.compile(load("brief.schema.json")),
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
