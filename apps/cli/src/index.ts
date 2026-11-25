#!/usr/bin/env node
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  BriefValidationError,
  GateError,
  TransitionError,
  compileBrief,
  decideGate,
  develop,
  newId,
  renderBriefMarkdown,
  transition,
} from "@latent/core";
import type {
  AssumptionStatus,
  Fragment,
  GateStatus,
  Idea,
} from "@latent/core";
import { TemplateReconstructor } from "@latent/adapters";
import { Store } from "@latent/store";
import { igem } from "@latent/vertical-igem";

const BOOLEAN_FLAGS = new Set(["all", "refute", "help"]);

interface Parsed {
  positionals: string[];
  flags: Record<string, string | true>;
}

function parseArgs(args: string[]): Parsed {
  const positionals: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === undefined) continue;
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      if (BOOLEAN_FLAGS.has(key)) {
        flags[key] = true;
        continue;
      }
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[key] = next;
        i += 1;
      } else {
        flags[key] = true;
      }
      continue;
    }
    positionals.push(arg);
  }
  return { positionals, flags };
}

class CliError extends Error {
  readonly code: number;
  constructor(message: string, code = 1) {
    super(message);
    this.name = "CliError";
    this.code = code;
  }
}

function openStore(): Store {
  const dbPath = process.env.LATENT_DB_PATH ?? "data/runtime/latent.sqlite";
  if (dbPath !== ":memory:") {
    mkdirSync(dirname(resolve(dbPath)), { recursive: true });
  }
  return new Store(dbPath);
}

function print(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

function requireIdea(store: Store, id: string | undefined): Idea {
  if (!id) throw new CliError("missing idea id", 1);
  const idea = store.getIdea(id);
  if (!idea) throw new CliError(`idea not found: ${id}`, 2);
  return idea;
}

function parseGateStatus(value: string | true | undefined): GateStatus {
  if (value === "pass" || value === "fail" || value === "unknown" || value === "waive") {
    return value === "waive" ? "waived" : value;
  }
  throw new CliError("gate status must be pass, fail, unknown or waive", 1);
}

const HELP = `latent — capture a fragment, develop it, decide the gates, compile a brief

Usage:
  latent capture <text>                       capture a text fragment
  latent develop <fragment-id>                reconstruct into hypotheses + gates
  latent confirm <idea-id> <assumption-id>    confirm one assumption (human)
  latent confirm <idea-id> --all [--refute]   confirm/refute every assumption (human)
  latent decide <idea-id> --all <status>      decide every gate (human)
  latent decide <idea-id> <gate-id> <status>  decide one gate (human)
  latent brief <idea-id> [--format md|json]   compile a brief (fails if blocked)
  latent show <id>                            show a fragment, idea or brief
  latent help                                 this text

Status: pass | fail | unknown | waive

Environment:
  LATENT_DB_PATH   SQLite path (default: data/runtime/latent.sqlite)
`;

async function main(): Promise<number> {
  const [command, ...rest] = process.argv.slice(2);
  const { positionals, flags } = parseArgs(rest);

  if (!command || command === "help" || flags.help) {
    console.log(HELP);
    return 0;
  }

  const store = openStore();
  const reconstructor = new TemplateReconstructor();

  try {
    switch (command) {
      case "capture": {
        const content = positionals.join(" ").trim();
        if (!content) throw new CliError("usage: latent capture <text>", 1);
        const fragment: Fragment = {
          id: newId("frg"),
          captured_at: new Date().toISOString(),
          kind: "text",
          content,
          privacy: "private",
          source: "cli",
          schema_version: "1.0.0",
        };
        store.putFragment(fragment);
        store.appendEvent("fragment.captured", fragment.id, { kind: fragment.kind });
        print({ id: fragment.id, status: "captured" });
        return 0;
      }

      case "develop": {
        const fragmentId = positionals[0];
        if (!fragmentId) throw new CliError("usage: latent develop <fragment-id>", 1);
        const fragment = store.getFragment(fragmentId);
        if (!fragment) throw new CliError(`fragment not found: ${fragmentId}`, 2);
        const result = await develop({ fragment, vertical: igem, reconstructor });
        store.putIdea(result.idea);
        store.putClaims(result.idea.id, result.claims);
        store.putGates(result.idea.id, result.gates);
        store.appendEvent("idea.developed", result.idea.id, {
          fragment_id: fragment.id,
          gates: result.gates.length,
        });
        print({
          id: result.idea.id,
          status: result.idea.status,
          hypotheses: result.idea.hypotheses.map((h) => ({
            id: h.id,
            variant: h.variant,
          })),
          assumptions: result.idea.assumptions.map((a) => ({
            id: a.id,
            risk: a.risk,
            status: a.status,
          })),
          questions: result.idea.open_questions?.map((q) => q.question) ?? [],
          gates: result.gates.map((g) => ({ id: g.id, name: g.name, status: g.status })),
        });
        return 0;
      }

      case "confirm": {
        const ideaId = positionals[0];
        const idea = requireIdea(store, ideaId);
        const status: AssumptionStatus = flags.refute ? "refuted" : "confirmed";
        const all = flags.all === true;
        const target = positionals[1];

        if (!all && !target) {
          throw new CliError("usage: latent confirm <idea-id> <assumption-id> | --all", 1);
        }
        if (!all && !idea.assumptions.some((a) => a.id === target)) {
          throw new CliError(`assumption not found: ${target ?? ""}`, 2);
        }

        const updated: Idea = {
          ...idea,
          assumptions: idea.assumptions.map((a) =>
            all || a.id === target
              ? { ...a, status, decided_by: "human" }
              : a,
          ),
          updated_at: new Date().toISOString(),
          version: idea.version + 1,
        };
        store.putIdea(updated);
        store.appendEvent("assumption.decided", idea.id, {
          all,
          status,
          decided_by: "human",
        });
        if (all) {
          console.error(
            "warning: every assumption was confirmed by a human without new evidence; this is recorded in the audit log.",
          );
        }
        print({
          id: updated.id,
          assumptions: updated.assumptions.map((a) => ({
            id: a.id,
            status: a.status,
          })),
        });
        return 0;
      }

      case "decide": {
        const ideaId = positionals[0];
        const idea = requireIdea(store, ideaId);
        const gates = store.listGates(idea.id);
        const all = flags.all === true;
        const status = parseGateStatus(positionals[all ? 1 : 2]);
        const gateId = all ? null : positionals[1];
        const reason = typeof flags.reason === "string" ? flags.reason : null;

        if (!all && !gateId) {
          throw new CliError("usage: latent decide <idea-id> <gate-id> <status>", 1);
        }

        const updated = gates.map((gate) => {
          if (!all && gate.id !== gateId) return gate;
          return decideGate(gate, status, "human", reason);
        });
        store.putGates(idea.id, updated);
        store.appendEvent("gate.decided", idea.id, {
          all,
          status,
          decided_by: "human",
        });
        print({
          id: idea.id,
          gates: updated.map((g) => ({
            id: g.id,
            name: g.name,
            status: g.status,
            decided_by: g.decided_by,
          })),
        });
        return 0;
      }

      case "brief": {
        const ideaId = positionals[0];
        const idea = requireIdea(store, ideaId);
        const claims = store.listClaims(idea.id);
        const gates = store.listGates(idea.id);

        let next = idea;
        if (next.status === "developed") next = transition(next, "verifying");
        if (next.status === "verifying") next = transition(next, "viable");
        if (next.status === "viable") next = transition(next, "briefed");

        const brief = compileBrief({ idea: next, claims, gates });
        const saved: Idea = { ...next, brief_ref: brief.id };
        store.putBrief(brief);
        store.putIdea(saved);
        store.appendEvent("brief.compiled", idea.id, { brief_id: brief.id });

        if (flags.format === "json") {
          print(brief);
        } else {
          console.log(renderBriefMarkdown(brief));
        }
        return 0;
      }

      case "show": {
        const id = positionals[0];
        if (!id) throw new CliError("usage: latent show <id>", 1);
        if (id.startsWith("frg_")) {
          const fragment = store.getFragment(id);
          if (!fragment) throw new CliError(`fragment not found: ${id}`, 2);
          print(fragment);
          return 0;
        }
        if (id.startsWith("brf_")) {
          const brief = store.getBrief(id);
          if (!brief) throw new CliError(`brief not found: ${id}`, 2);
          print(brief);
          return 0;
        }
        const idea = requireIdea(store, id);
        print({
          idea,
          claims: store.listClaims(idea.id),
          gates: store.listGates(idea.id),
          brief: store.getBriefByIdea(idea.id),
        });
        return 0;
      }

      default:
        throw new CliError(`unknown command: ${command}\n\n${HELP}`, 1);
    }
  } finally {
    store.close();
  }
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    if (error instanceof BriefValidationError) {
      console.error("brief blocked:");
      for (const issue of error.issues) console.error(`  - ${issue}`);
      process.exit(3);
    }
    if (error instanceof TransitionError) {
      console.error(`${error.code}: ${error.message}`);
      process.exit(3);
    }
    if (error instanceof GateError) {
      console.error(`${error.code}: ${error.message}`);
      process.exit(3);
    }
    if (error instanceof CliError) {
      console.error(error.message);
      process.exit(error.code);
    }
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
