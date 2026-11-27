#!/usr/bin/env node
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  BriefValidationError,
  ConstraintAnswerError,
  ConstraintError,
  OutcomeError,
  SchemaValidationError,
  SpecValidationError,
  GateError,
  IncubationError,
  TransitionError,
  answerConstraint,
  blockingQuestions,
  compileBrief,
  compileSpec,
  createConstraintState,
  createOutcome,
  DEFAULT_MIN_SAMPLES,
  decideGate,
  develop,
  developEdges,
  diffConstraintStates,
  findQuestion,
  questionKind,
  newId,
  nextQuestion,
  observationsFromOutcomes,
  DeterministicClaimVerifier,
  renderBriefMarkdown,
  exportBriefHtml,
  renderReplayMarkdown,
  renderSpecMarkdown,
  runReplayCase,
  outcomeEdge,
  questionPriors,
  runIncubation,
  SuggestionError,
  transition,
  undoConstraint,
  validateReplayCase,
  verifyEvidence,
} from "@latent/core";
import type {
  AssumptionStatus,
  ConstraintState,
  Fragment,
  GateStatus,
  Claim,
  Idea,
  Job,
  MemoryNodeType,
  OutcomeDecision,
  QuestionDefinition,
  ReplayCase,
} from "@latent/core";
import { NoopAgentRuntime, reconstructorFromEnv } from "@latent/adapters";
import { JobError, Store } from "@latent/store";
import { igem } from "@latent/vertical-igem";

const BOOLEAN_FLAGS = new Set([
  "all",
  "failure",
  "help",
  "json",
  "mark",
  "refute",
  "success",
  "verify",
]);

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

let JSON_OUTPUT = false;
let CURRENT_COMMAND = "";

function exitCodeName(code: number): string {
  switch (code) {
    case 2:
      return "NOT_FOUND";
    case 3:
      return "BLOCKED";
    case 4:
      return "AUTH";
    case 5:
      return "PROVIDER";
    default:
      return "INVALID";
  }
}

function emit(
  flags: Record<string, string | true>,
  command: string,
  data: unknown,
): void {
  if (flags.json === true) {
    console.log(JSON.stringify({ ok: true, command, data }, null, 2));
    return;
  }
  print(data);
}

function fail(
  code: number,
  errorCode: string,
  message: string,
  details?: unknown,
): never {
  if (JSON_OUTPUT) {
    const error: Record<string, unknown> = { code: errorCode, message };
    if (details !== undefined) error.details = details;
    console.error(
      JSON.stringify(
        { ok: false, command: CURRENT_COMMAND, error },
        null,
        2,
      ),
    );
  } else {
    console.error(message);
  }
  process.exit(code);
}

function renderLedgerMarkdown(claims: Claim[]): string {
  const rows = claims.map(
    (claim) =>
      `| ${claim.id} | ${claim.status} | ${claim.confidence.toFixed(2)} | ${claim.text.replace(/\|/g, "\\|")} |`,
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
  latent constraints undo <idea-id>           undo the last answer as a new version
  latent constraints diff <idea-id>           show the last answer's variable diff
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
  latent outcome <idea-id> <decision>         record shipped|tested|parked|killed|failed
        --success|--failure [--confidence N] [--notes "..."] [--by human|expert]
  latent outcomes [idea-id]                   list recorded outcomes
  latent calibration [--owner <id>]           Brier, log loss and missing outcomes
  latent priors [--min-samples N]             empirical option priors from outcomes
  latent incubate <idea|fragment-id>          propose connections within a budget
  latent suggestions [--status proposed]      list incubation suggestions
  latent suggestion <id> <accept|reject|revoke>
  latent digest [--since ISO]                 weekly proposal digest
  latent show <id>                            show a fragment, idea or brief
  latent help                                 this text

Status: pass | fail | unknown | waive

Environment:
  LATENT_DB_PATH   SQLite path (default: data/runtime/latent.sqlite)
`;

async function main(): Promise<number> {
  const [command, ...rest] = process.argv.slice(2);
  const { positionals, flags } = parseArgs(rest);
  const effectiveCommand = command === "constraint" ? "constraints" : command;
  JSON_OUTPUT = flags.json === true;
  CURRENT_COMMAND = effectiveCommand ?? "help";
  const out = (data: unknown) => emit(flags, CURRENT_COMMAND, data);

  if (!command || command === "help" || flags.help) {
    if (JSON_OUTPUT) {
      emit(flags, "help", { help: HELP });
    } else {
      console.log(HELP);
    }
    return 0;
  }

  const store = openStore();
  const reconstructor = reconstructorFromEnv();

  try {
    switch (effectiveCommand) {
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
        out({ id: fragment.id, status: "captured" });
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
        out({
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
        out({
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
        out({
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
        out({
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
        store.appendEvent("constraint.answered", idea.id, {
          variable,
          value,
          version_before: state.version,
          version_after: updated.version,
          before: state,
          after: updated,
        });
        out({
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
        const sub = positionals[0];
        const action = sub === "undo" || sub === "diff" ? sub : null;
        const idea = requireIdea(store, action ? positionals[1] : sub);
        const state =
          store.getConstraintState(idea.id) ??
          createConstraintState(idea.vertical ?? "igem", igem.questions);
        const answers = store
          .listEvents(idea.id)
          .filter((event) => event.type === "constraint.answered");
        const last = answers[answers.length - 1];

        if (action === "undo") {
          if (!last) throw new CliError("no constraint answer to undo", 1);
          const payload = last.data as { before?: ConstraintState };
          if (!payload.before) {
            throw new CliError(
              "the last constraint answer has no state snapshot",
              1,
            );
          }
          const restored = undoConstraint(state, payload.before, igem.questions);
          store.putConstraintState(idea.id, restored);
          store.appendEvent("constraint.undone", idea.id, {
            event_id: last.id,
            before: state,
            after: restored,
          });
          out({
            idea_id: idea.id,
            undone_event: last.id,
            state: restored,
            blocking: restored.blocking_unknowns,
            next_question: nextQuestion(restored, igem.questions),
          });
          return 0;
        }

        if (action === "diff") {
          if (!last) throw new CliError("no constraint answer to diff", 1);
          const payload = last.data as {
            before?: ConstraintState;
            after?: ConstraintState;
            variable?: string;
          };
          const changes =
            payload.before && payload.after
              ? diffConstraintStates(payload.before, payload.after)
              : [];
          out({
            idea_id: idea.id,
            event_id: last.id,
            variable: payload.variable ?? null,
            changes,
          });
          return 0;
        }

        out({
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

        if (flags.json === true) {
          out(brief);
        } else if (flags.format === "json") {
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
          if (flags.json === true) {
            fail(1, "INVALID_REPLAY_CASE", "replay case failed validation", issues);
          }
          out({ ok: false, issues });
          return 1;
        }
        const replay = value as ReplayCase;
        if (sub === "validate") {
          out({
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
          out(result);
        }
        return 0;
      }

      case "spec": {
        const idea = requireIdea(store, positionals[0]);
        const claims = store.listClaims(idea.id);
        const gates = store.listGates(idea.id);
        const spec = compileSpec({ idea, claims, gates });
        if (flags.json === true) {
          out(spec);
        } else if (flags.format === "json") {
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
        if (flags.json === true) {
          out({ idea_id: idea.id, claims });
        } else if (flags.format === "md") {
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
          out(fragment);
          return 0;
        }
        if (id.startsWith("brf_")) {
          const brief = store.getBrief(id);
          if (!brief) throw new CliError(`brief not found: ${id}`, 2);
          out(brief);
          return 0;
        }
        const idea = requireIdea(store, id);
        out({
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
          out({ owner_id: ownerId, hits: store.searchMemory(query, { ownerId }) });
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
          out(
            store.connectionExplanation(
              { type: nodeTypeFromId(fromId), id: fromId },
              { type: nodeTypeFromId(toId), id: toId },
              { ownerId, maxDepth: depth },
            ),
          );
          return 0;
        }
        if (sub === "export") {
          out(store.exportMemory({ ownerId }));
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
          out(result);
          return result.deleted ? 0 : 1;
        }
        throw new CliError("usage: latent memory <search|connect|export|delete>", 1);
      }

      case "outcome": {
        const idea = requireIdea(store, positionals[0]);
        const decisions: OutcomeDecision[] = [
          "shipped",
          "tested",
          "parked",
          "killed",
          "failed",
        ];
        const rawDecision = positionals[1];
        if (
          !rawDecision ||
          !decisions.includes(rawDecision as OutcomeDecision)
        ) {
          throw new CliError(
            "usage: latent outcome <idea-id> <shipped|tested|parked|killed|failed> (--success|--failure) [--confidence N]",
            1,
          );
        }
        if (flags.success === true && flags.failure === true) {
          throw new CliError("choose --success or --failure, not both", 1);
        }
        const realised =
          flags.success === true
            ? true
            : flags.failure === true
              ? false
              : undefined;
        if (realised === undefined) {
          throw new CliError(
            "record the realised result with --success or --failure",
            1,
          );
        }
        const maxConfidence = idea.hypotheses.reduce(
          (max, hypothesis) => Math.max(max, hypothesis.confidence),
          0,
        );
        const confidence =
          typeof flags.confidence === "string"
            ? Number(flags.confidence)
            : maxConfidence;
        const ownerId = typeof flags.owner === "string" ? flags.owner : "local";
        const decidedBy = flags.by === "expert" ? "expert" : "human";
        const outcome = createOutcome({
          idea_id: idea.id,
          idea_version: idea.version,
          owner_id: ownerId,
          decision: rawDecision as OutcomeDecision,
          realised_success: realised,
          predicted_confidence: confidence,
          predicted_at: idea.updated_at ?? idea.created_at ?? null,
          decided_by: decidedBy,
          evidence: idea.claims,
          notes: typeof flags.notes === "string" ? flags.notes : null,
        });
        store.putOutcome(outcome);
        store.putEdge(outcomeEdge(outcome));
        let saved = idea;
        if (idea.status === "briefed") {
          saved = transition(idea, "learned");
          store.putIdea(saved);
        }
        store.appendEvent("outcome.recorded", idea.id, {
          outcome_id: outcome.id,
          decision: outcome.decision,
          realised_success: outcome.realised_success,
        });
        out({ outcome, idea_status: saved.status });
        return 0;
      }

      case "outcomes": {
        const ownerId = typeof flags.owner === "string" ? flags.owner : "local";
        out({
          owner_id: ownerId,
          outcomes: store.listOutcomes({
            ownerId,
            ideaId: positionals[0],
          }),
        });
        return 0;
      }

      case "calibration": {
        const ownerId = typeof flags.owner === "string" ? flags.owner : "local";
        out(store.calibrationReport({ ownerId }));
        return 0;
      }

      case "priors": {
        const ownerId = typeof flags.owner === "string" ? flags.owner : "local";
        const rawMin =
          typeof flags["min-samples"] === "string"
            ? Number(flags["min-samples"])
            : Number.NaN;
        const minSamples = Number.isFinite(rawMin) ? rawMin : undefined;
        const outcomes = store.listOutcomes({ ownerId });
        const states = new Map(
          store.listConstraintStates().map((entry) => [entry.ideaId, entry.state]),
        );
        const observations = observationsFromOutcomes(
          outcomes,
          states,
          igem.questions,
        );
        out({
          owner_id: ownerId,
          outcome_sample_count: outcomes.length,
          min_samples: minSamples ?? DEFAULT_MIN_SAMPLES,
          questions: questionPriors(igem.questions, observations, { minSamples }),
        });
        return 0;
      }

      case "incubate": {
        const seedId = positionals[0];
        if (!seedId) {
          throw new CliError(
            "usage: latent incubate <idea-id|fragment-id> [--budget N] [--min-score N] [--since ISO]",
            1,
          );
        }
        const seedType = nodeTypeFromId(seedId);
        if (seedType !== "idea" && seedType !== "fragment") {
          throw new CliError("incubate needs an idea or fragment id", 1);
        }
        if (seedType === "idea" && !store.getIdea(seedId)) {
          throw new CliError(`idea not found: ${seedId}`, 2);
        }
        if (seedType === "fragment" && !store.getFragment(seedId)) {
          throw new CliError(`fragment not found: ${seedId}`, 2);
        }
        const ownerId = typeof flags.owner === "string" ? flags.owner : "local";
        const budget = typeof flags.budget === "string" ? Number(flags.budget) : 5;
        const minScore =
          typeof flags["min-score"] === "string"
            ? Number(flags["min-score"])
            : 0.2;
        const since = typeof flags.since === "string" ? flags.since : null;
        let job: Job;
        try {
          job = store.createJob({ ownerId, budget });
        } catch (error) {
          if (error instanceof JobError) {
            throw new CliError(`${error.code}: ${error.message}`, 1);
          }
          throw error;
        }
        job = { ...job, status: "running", updated_at: new Date().toISOString() };
        store.putJob(job);

        const nodes = [
          ...store.listFragments().map((fragment) => ({
            ref: { type: "fragment" as const, id: fragment.id },
            text: fragment.content,
            created_at: fragment.captured_at,
          })),
          ...store.listIdeas().map((idea) => ({
            ref: { type: "idea" as const, id: idea.id },
            text: [
              idea.title,
              idea.one_liner,
              ...idea.hypotheses.map((hypothesis) => hypothesis.statement),
            ].join(" "),
            created_at: idea.created_at,
            updated_at: idea.updated_at,
          })),
        ];

        const result = await runIncubation(
          {
            owner_id: ownerId,
            job_id: job.id,
            seed: { type: seedType, id: seedId },
            nodes,
            edges: store.listEdges({ ownerId }),
            existing: store
              .listSuggestions({ ownerId })
              .map((item) => ({ from: item.from, to: item.to })),
            budget,
            min_score: minScore,
            since,
          },
          new NoopAgentRuntime(),
        );
        for (const suggestion of result.suggestions) {
          store.putSuggestion(suggestion);
        }
        const finished = {
          ...job,
          status: "succeeded" as const,
          spent: result.spent,
          updated_at: new Date().toISOString(),
        };
        store.putJob(finished);
        store.appendEvent("job.succeeded", finished.id, {
          suggestions: result.suggestions.length,
          spent: result.spent,
        });
        out({
          job: finished,
          spent: result.spent,
          skipped: result.skipped,
          suggestions: result.suggestions,
        });
        return 0;
      }

      case "suggestions": {
        const ownerId = typeof flags.owner === "string" ? flags.owner : "local";
        const rawStatus = flags.status;
        const status =
          rawStatus === "proposed" ||
          rawStatus === "accepted" ||
          rawStatus === "rejected" ||
          rawStatus === "revoked"
            ? rawStatus
            : undefined;
        if (rawStatus !== undefined && status === undefined) {
          throw new CliError(
            "status must be proposed, accepted, rejected or revoked",
            1,
          );
        }
        out({
          owner_id: ownerId,
          suggestions: store.listSuggestions({
            ownerId,
            status,
            jobId: typeof flags.job === "string" ? flags.job : undefined,
          }),
        });
        return 0;
      }

      case "suggestion": {
        const id = positionals[0];
        const action = positionals[1];
        if (
          !id ||
          (action !== "accept" && action !== "reject" && action !== "revoke")
        ) {
          throw new CliError(
            "usage: latent suggestion <id> <accept|reject|revoke>",
            1,
          );
        }
        const status =
          action === "accept"
            ? "accepted"
            : action === "reject"
              ? "rejected"
              : "revoked";
        try {
          out(store.decideSuggestion(id, status));
        } catch (error) {
          if (error instanceof JobError || error instanceof SuggestionError) {
            throw new CliError(`${error.code}: ${error.message}`, 1);
          }
          throw error;
        }
        return 0;
      }

      case "digest": {
        const ownerId = typeof flags.owner === "string" ? flags.owner : "local";
        const since = typeof flags.since === "string" ? flags.since : null;
        out(store.suggestionDigest({ ownerId, since }));
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
      fail(3, "BRIEF_VALIDATION_FAILED", error.message, error.issues);
    }
    if (error instanceof SpecValidationError) {
      fail(3, "SPEC_VALIDATION_FAILED", error.message, error.issues);
    }
    if (error instanceof ConstraintError) {
      fail(
        3,
        "BLOCKING_CONSTRAINTS",
        "Answer the blocking constraints first.",
        error.variables,
      );
    }
    if (error instanceof OutcomeError) {
      fail(1, error.code, error.message);
    }
    if (error instanceof ConstraintAnswerError) {
      fail(1, error.code, error.message);
    }
    if (error instanceof TransitionError) {
      fail(3, error.code, error.message);
    }
    if (error instanceof GateError) {
      fail(3, error.code, error.message);
    }
    if (error instanceof SchemaValidationError) {
      fail(
        1,
        "SCHEMA_VALIDATION_FAILED",
        error.message,
        error.errors.map((issue) => issue.message ?? "invalid"),
      );
    }
    if (error instanceof IncubationError) {
      fail(1, error.code, error.message);
    }
    if (error instanceof SuggestionError) {
      fail(1, error.code, error.message);
    }
    if (error instanceof JobError) {
      fail(1, error.code, error.message);
    }
    if (error instanceof CliError) {
      fail(error.code, exitCodeName(error.code), error.message);
    }
    fail(1, "ERROR", error instanceof Error ? error.message : String(error));
  });
