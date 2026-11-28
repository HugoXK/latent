#!/usr/bin/env node
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  BiosafetyError,
  BriefValidationError,
  ConstraintAnswerError,
  ConstraintError,
  SpecValidationError,
  GateError,
  TransitionError,
  answerConstraint,
  blockingQuestions,
  compileBrief,
  compileSpec,
  createConstraintState,
  decideGate,
  develop,
  developEdges,
  findQuestion,
  questionKind,
  newId,
  nextQuestion,
  DeterministicClaimVerifier,
  renderBriefMarkdown,
  exportBriefHtml,
  renderReplayMarkdown,
  renderSpecMarkdown,
  runReplayCase,
  transition,
  validateReplayCase,
  verifyEvidence,
} from "@latent/core";
import type {
  AssumptionStatus,
  Fragment,
  GateStatus,
  Claim,
  Idea,
  MemoryNodeType,
  QuestionDefinition,
  ReplayCase,
} from "@latent/core";
import { reconstructorFromEnv } from "@latent/adapters";
import { Store } from "@latent/store";
import { igem } from "@latent/vertical-igem";

const BOOLEAN_FLAGS = new Set(["all", "refute", "help", "mark", "verify"]);

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

function escapeTableCell(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ");
}

function renderLedgerMarkdown(claims: Claim[]): string {
  const rows = claims.map(
    (claim) =>
      `| ${claim.id} | ${claim.status} | ${claim.confidence.toFixed(2)} | ${escapeTableCell(claim.text)} |`,
  );
  return [
    "| Claim | Status | Confidence | Text |",
    "|---|---|---|---|",
    ...rows,
  ].join("\n");
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

function nodeTypeFromId(id: string): MemoryNodeType {
  if (id.startsWith("frg_")) return "fragment";
  if (id.startsWith("idea_")) return "idea";
  if (id.startsWith("clm_")) return "claim";
  if (id.startsWith("gate_")) return "gate";
  if (id.startsWith("outcome_")) return "outcome";
  throw new CliError(`cannot infer a node type from id: ${id}`, 1);
}

function parseOptionValue(
  question: QuestionDefinition | null,
  raw: string,
): unknown {
  const trimmed = raw.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (question) {
    const byValue = question.options.find((o) => String(o.value) === trimmed);
    if (byValue) return byValue.value;
    const byLabel = question.options.find(
      (o) => o.label.toLowerCase() === trimmed.toLowerCase(),
    );
    if (byLabel) return byLabel.value;
  }
  const numeric = Number(trimmed);
  if (trimmed !== "" && !Number.isNaN(numeric)) return numeric;
  return trimmed;
}

function parseAnswerValues(
  question: QuestionDefinition | null,
  raws: string[],
): unknown {
  const kind = question ? questionKind(question) : "single";
  if (kind === "text") {
    const value = raws.join(" ").trim();
    if (value === "") {
      throw new CliError("text answer must not be empty", 1);
    }
    return value;
  }
  if (kind === "multi") {
    const values = raws
      .flatMap((raw) => raw.split(","))
      .map((raw) => raw.trim())
      .filter((raw) => raw !== "")
      .map((raw) => parseOptionValue(question, raw));
    if (values.length === 0) {
      throw new CliError("multi answer needs at least one value", 1);
    }
    return Array.from(new Set(values));
  }
  const raw = raws.join(" ").trim();
  if (raw === "") throw new CliError("answer must not be empty", 1);
  return parseOptionValue(question, raw);
}

const HELP = `latent — capture a fragment, develop it, decide the gates, compile a brief

Usage:
  latent capture <text>                       capture a text fragment
  latent develop <fragment-id>                reconstruct into hypotheses + gates
  latent ask <idea-id>                        the next highest-information question
  latent answer <idea-id> <var> <value>       answer one constraint (human)
  latent constraints <idea-id>                show the constraint state
  latent confirm <idea-id> <assumption-id>    confirm one assumption (human)
  latent confirm <idea-id> --all [--refute]   confirm/refute every assumption (human)
  latent decide <idea-id> --all <status>      decide every gate (human)
  latent decide <idea-id> <gate-id> <status>  decide one gate (human)
  latent brief <idea-id> [--format md|json|html] [--verify]  compile a brief (fails if blocked)
  latent spec <idea-id> [--format md|json]            compile an implementation spec
  latent ledger export <idea-id> [--format jsonl|md]   export the claim ledger
  latent eval validate <file>                 validate a replay case
  latent eval replay <file> [--format md]     run the replay harness
  latent memory search <query>                search fragments and ideas
  latent memory connect <from-id> <to-id>     explain why two nodes are connected
  latent memory export [--owner <id>]         export the owner's memory graph
  latent memory delete <fragment-id> [--mark] delete a fragment (blocks if referenced)
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
  const reconstructor = reconstructorFromEnv();

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
        let teamBsl: number | undefined;
        if (flags.bsl !== undefined) {
          teamBsl = Number(flags.bsl);
          if (!Number.isInteger(teamBsl) || teamBsl < 1 || teamBsl > 4) {
            throw new CliError("--bsl must be an integer from 1 to 4", 1);
          }
        }
        let result;
        try {
          result = await develop({
            fragment,
            vertical: igem,
            reconstructor,
            team_bsl: teamBsl,
          });
        } catch (error) {
          if (error instanceof BiosafetyError) {
            store.appendEvent("biosafety.refused", fragment.id, {
              category: error.verdict.category,
              bsl: error.verdict.bsl,
            });
          }
          throw error;
        }
        store.putIdea(result.idea);
        store.putClaims(result.idea.id, result.claims);
        store.putGates(result.idea.id, result.gates);
        store.putConstraintState(result.idea.id, result.constraint);
        for (const edge of developEdges({
          idea: result.idea,
          fragmentId: fragment.id,
        })) {
          store.putEdge(edge);
        }
        store.appendEvent("idea.developed", result.idea.id, {
          fragment_id: fragment.id,
          gates: result.gates.length,
        });
        const first = nextQuestion(result.constraint, igem.questions);
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
          blocking: result.constraint.blocking_unknowns,
          first_question: first,
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

      case "ask": {
        const idea = requireIdea(store, positionals[0]);
        const state =
          store.getConstraintState(idea.id) ??
          createConstraintState(idea.vertical ?? "igem", igem.questions);
        const blocking = blockingQuestions(state, igem.questions).map(
          (q) => q.variable,
        );
        print({
          idea_id: idea.id,
          ready: blocking.length === 0,
          blocking,
          question: nextQuestion(state, igem.questions),
        });
        return 0;
      }

      case "answer": {
        const idea = requireIdea(store, positionals[0]);
        const variable = positionals[1];
        const raws = positionals.slice(2);
        if (!variable || raws.length === 0) {
          throw new CliError(
            "usage: latent answer <idea-id> <variable> <value>",
            1,
          );
        }
        const state =
          store.getConstraintState(idea.id) ??
          createConstraintState(idea.vertical ?? "igem", igem.questions);
        const question = findQuestion(igem.questions, variable);
        const value = parseAnswerValues(question, raws);
        const updated = answerConstraint(state, igem.questions, variable, value, 1);
        store.putConstraintState(idea.id, updated);
        store.appendEvent("constraint.answered", idea.id, { variable });
        print({
          idea_id: idea.id,
          variable,
          value,
          blocking: blockingQuestions(updated, igem.questions).map(
            (q) => q.variable,
          ),
          next_question: nextQuestion(updated, igem.questions),
        });
        return 0;
      }

      case "constraints": {
        const idea = requireIdea(store, positionals[0]);
        const state =
          store.getConstraintState(idea.id) ??
          createConstraintState(idea.vertical ?? "igem", igem.questions);
        print({
          idea_id: idea.id,
          state,
          blocking: blockingQuestions(state, igem.questions).map(
            (q) => q.variable,
          ),
          next_question: nextQuestion(state, igem.questions),
        });
        return 0;
      }

      case "brief": {
        const ideaId = positionals[0];
        const idea = requireIdea(store, ideaId);
        let claims = store.listClaims(idea.id);
        const gates = store.listGates(idea.id);

        if (flags.verify === true) {
          const report = await verifyEvidence(claims, {
            verifier: new DeterministicClaimVerifier(),
          });
          claims = report.claims;
          store.putClaims(idea.id, claims);
        }

        const constraint = store.getConstraintState(idea.id);
        if (constraint) {
          const blocking = blockingQuestions(constraint, igem.questions);
          if (blocking.length > 0) {
            throw new ConstraintError(blocking.map((q) => q.variable));
          }
        }

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
        } else if (flags.format === "html") {
          console.log(exportBriefHtml(brief));
        } else {
          console.log(renderBriefMarkdown(brief));
        }
        return 0;
      }

      case "eval": {
        const sub = positionals[0];
        const file = positionals[1];
        if ((sub !== "validate" && sub !== "replay") || !file) {
          throw new CliError("usage: latent eval <validate|replay> <file>", 1);
        }
        let raw: string;
        try {
          raw = readFileSync(resolve(file), "utf8");
        } catch {
          throw new CliError(`replay case not found: ${file}`, 2);
        }
        let value: unknown;
        try {
          value = JSON.parse(raw) as unknown;
        } catch {
          throw new CliError(`replay case is not valid JSON: ${file}`, 1);
        }
        const issues = validateReplayCase(value);
        if (issues.length > 0) {
          print({ ok: false, issues });
          return 1;
        }
        const replay = value as ReplayCase;
        if (sub === "validate") {
          print({
            ok: true,
            id: replay.metadata.id,
            illustrative: replay.metadata.illustrative,
            temporal_cutoff: replay.metadata.temporal_cutoff,
          });
          return 0;
        }
        const result = await runReplayCase({
          case: replay,
          vertical: igem,
          reconstructor,
        });
        if (flags.format === "md") {
          console.log(renderReplayMarkdown(result));
        } else {
          print(result);
        }
        return 0;
      }

      case "spec": {
        const idea = requireIdea(store, positionals[0]);
        const claims = store.listClaims(idea.id);
        const gates = store.listGates(idea.id);
        const spec = compileSpec({ idea, claims, gates });
        if (flags.format === "json") {
          print(spec);
        } else {
          console.log(renderSpecMarkdown(spec));
        }
        return 0;
      }

      case "ledger": {
        const sub = positionals[0];
        const ideaId = positionals[1];
        if (sub !== "export" || !ideaId) {
          throw new CliError(
            "usage: latent ledger export <idea-id> [--format jsonl|md]",
            1,
          );
        }
        const idea = requireIdea(store, ideaId);
        const claims = store.listClaims(idea.id);
        if (flags.format === "md") {
          console.log(renderLedgerMarkdown(claims));
        } else {
          for (const claim of claims) console.log(JSON.stringify(claim));
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

      case "memory": {
        const sub = positionals[0];
        const ownerId = typeof flags.owner === "string" ? flags.owner : "local";
        if (sub === "search") {
          const query = positionals.slice(1).join(" ").trim();
          if (!query) throw new CliError("usage: latent memory search <query>", 1);
          print({ owner_id: ownerId, hits: store.searchMemory(query, { ownerId }) });
          return 0;
        }
        if (sub === "connect") {
          const fromId = positionals[1];
          const toId = positionals[2];
          if (!fromId || !toId) {
            throw new CliError(
              "usage: latent memory connect <from-id> <to-id> [--depth N]",
              1,
            );
          }
          const rawDepth = typeof flags.depth === "string" ? Number(flags.depth) : 3;
          const depth = Number.isFinite(rawDepth) ? rawDepth : 3;
          print(
            store.connectionExplanation(
              { type: nodeTypeFromId(fromId), id: fromId },
              { type: nodeTypeFromId(toId), id: toId },
              { ownerId, maxDepth: depth },
            ),
          );
          return 0;
        }
        if (sub === "export") {
          print(store.exportMemory({ ownerId }));
          return 0;
        }
        if (sub === "delete") {
          const fragmentId = positionals[1];
          if (!fragmentId) {
            throw new CliError("usage: latent memory delete <fragment-id> [--mark]", 1);
          }
          const result = store.deleteFragment(fragmentId, {
            ownerId,
            policy: flags.mark === true ? "mark" : "block",
          });
          print(result);
          return result.deleted ? 0 : 1;
        }
        throw new CliError("usage: latent memory <search|connect|export|delete>", 1);
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
    if (error instanceof SpecValidationError) {
      console.error("spec blocked:");
      for (const issue of error.issues) console.error(`  - ${issue}`);
      process.exit(3);
    }
    if (error instanceof ConstraintError) {
      console.error("blocking constraints:");
      for (const variable of error.variables) console.error(`  - ${variable}`);
      process.exit(3);
    }
    if (error instanceof ConstraintAnswerError) {
      console.error(error.message);
      process.exit(1);
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
