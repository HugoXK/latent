import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

type JsonSchema = {
  $id?: string;
  title?: string;
  type?: string | string[];
  enum?: unknown[];
  const?: unknown;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  $ref?: string;
  $defs?: Record<string, JsonSchema>;
  additionalProperties?: boolean | JsonSchema;
};

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SCHEMA_DIR = join(ROOT, "data/schemas");
const OUT = join(ROOT, "packages/core/src/generated/schemas.ts");

function pascal(value: string): string {
  return value
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function key(name: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : JSON.stringify(name);
}

function union(parts: string[]): string {
  return parts.length === 1 ? (parts[0] as string) : parts.join(" | ");
}

function arrayOf(item: string): string {
  return item.includes("|") || item.includes(" ") ? `(${item})[]` : `${item}[]`;
}

interface Context {
  defs: Map<string, string>;
  refs: Map<string, string>;
}

function primitive(
  type: string,
  schema: JsonSchema,
  ctx: Context,
  depth: number,
): string {
  switch (type) {
    case "string":
      return "string";
    case "number":
    case "integer":
      return "number";
    case "boolean":
      return "boolean";
    case "null":
      return "null";
    case "array":
      return arrayOf(tsType(schema.items ?? {}, ctx, depth));
    case "object":
      if (schema.properties) return objectLiteral(schema, ctx, depth);
      return "Record<string, unknown>";
    default:
      return "unknown";
  }
}

function tsType(schema: JsonSchema, ctx: Context, depth = 0): string {
  const unsupported = ["oneOf", "anyOf", "allOf", "if", "then"].find((word) =>
    Object.prototype.hasOwnProperty.call(schema, word),
  );
  if (unsupported) {
    throw new Error(
      `unsupported schema construct: ${unsupported}; extend scripts/generate-schema-types.ts`,
    );
  }
  if (schema.$ref !== undefined) {
    if (schema.$ref.startsWith("#/$defs/")) {
      const name = schema.$ref.slice("#/$defs/".length);
      return ctx.defs.get(name) ?? "unknown";
    }
    return ctx.refs.get(schema.$ref) ?? "unknown";
  }
  if (schema.const !== undefined) return JSON.stringify(schema.const);
  if (schema.enum !== undefined) {
    return union(schema.enum.map((value) => JSON.stringify(value)));
  }
  const types = Array.isArray(schema.type)
    ? schema.type
    : schema.type !== undefined
      ? [schema.type]
      : [];
  if (types.includes("null")) {
    const rest = types.filter((type) => type !== "null");
    if (rest.length === 0) return "null";
    return `${union(rest.map((type) => primitive(type, schema, ctx)))} | null`;
  }
  if (types.length > 1) {
    return union(types.map((type) => primitive(type, schema, ctx, depth)));
  }
  const only = types[0];
  if (only === undefined) {
    if (schema.properties) return objectLiteral(schema, ctx, depth);
    return "unknown";
  }
  return primitive(only, schema, ctx, depth);
}

function objectLiteral(
  schema: JsonSchema,
  ctx: Context,
  depth: number,
): string {
  const properties = schema.properties ?? {};
  const required = new Set(schema.required ?? []);
  const pad = "  ".repeat(depth + 1);
  const close = "  ".repeat(depth);
  const lines = Object.entries(properties).map(([name, property]) => {
    const optional = required.has(name) ? "" : "?";
    return `${pad}${key(name)}${optional}: ${tsType(property, ctx, depth + 1)};`;
  });
  if (lines.length === 0) return "Record<string, unknown>";
  return `{\n${lines.join("\n")}\n${close}}`;
}

function declaration(name: string, schema: JsonSchema, ctx: Context): string {
  if (schema.type === "object" && schema.properties) {
    return `export interface ${name} ${objectLiteral(schema, ctx, 0)}`;
  }
  return `export type ${name} = ${tsType(schema, ctx)};`;
}

function generate(): string {
  const files = readdirSync(SCHEMA_DIR)
    .filter((name) => name.endsWith(".schema.json"))
    .sort()
    .sort();
  const schemas = files.map((file) => {
    const schema = JSON.parse(
      readFileSync(join(SCHEMA_DIR, file), "utf8"),
    ) as JsonSchema;
    const title = schema.title;
    if (!title) throw new Error(`${file}: missing title`);
    return { file, schema, title };
  });

  const refs = new Map<string, string>();
  for (const { schema, title } of schemas) {
    if (schema.$id) refs.set(schema.$id, title);
  }

  const chunks: string[] = [
    "// Generated from data/schemas by scripts/generate-schema-types.ts.",
    "// Do not edit by hand. Run `pnpm schema:types`.",
    "",
  ];

  for (const { schema, title } of schemas) {
    const defs = new Map<string, string>();
    for (const name of Object.keys(schema.$defs ?? {}).sort()) {
      defs.set(name, `${title}${pascal(name)}`);
    }
    const ctx: Context = { defs, refs };
    chunks.push(declaration(title, schema, ctx));
    for (const [name, defSchema] of Object.entries(schema.$defs ?? {}).sort(
      ([a], [b]) => a.localeCompare(b),
    )) {
      chunks.push(declaration(defs.get(name) as string, defSchema, ctx));
    }
    chunks.push("");
  }

  return `${chunks.join("\n").trimEnd()}\n`;
}

const output = generate();
const check = process.argv.includes("--check");

if (check) {
  let existing = "";
  try {
    existing = readFileSync(OUT, "utf8");
  } catch {
    existing = "";
  }
  if (existing !== output) {
    const expected = output.split("\n");
    const actual = existing.split("\n");
    const at = expected.findIndex((line, index) => line !== actual[index]);
    console.error(
      `generated schema types are stale at line ${at + 1}: expected ${JSON.stringify(
        expected[at] ?? "<eof>",
      )}, found ${JSON.stringify(actual[at] ?? "<eof>")}`,
    );
    console.error("run `pnpm schema:types` and commit the result");
    process.exit(1);
  }
  console.log("generated schema types are up to date");
} else {
  mkdirSync(join(ROOT, "packages/core/src/generated"), { recursive: true });
  writeFileSync(OUT, output);
  console.log(`wrote ${OUT.replace(`${ROOT}/`, "")}`);
}
