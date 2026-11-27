import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import Fastify, { type FastifyInstance } from "fastify";
import {
  BriefValidationError,
  ConstraintAnswerError,
  GateError,
  OutcomeError,
  TransitionError,
  answerConstraint,
  blockingQuestions,
  compileBrief,
  createConstraintState,
  createOutcome,
  decideGate,
  develop,
  developEdges,
  findQuestion,
  newId,
  nextQuestion,
  outcomeEdge,
  questionKind,
  transition,
} from "@latent/core";
import type {
  AssumptionStatus,
  Fragment,
  Idea,
  OutcomeDecision,
  QuestionDefinition,
} from "@latent/core";
import { TemplateReconstructor, reconstructorFromEnv } from "@latent/adapters";
import { Store } from "@latent/store";
import { igem } from "@latent/vertical-igem";
import type { Reconstructor } from "@latent/core";

export interface ServerOptions {
  store: Store;
  logger?: boolean;
  reconstructor?: Reconstructor;
}

const VERSION = "0.2.0-alpha.0";

function normalizeSingle(
  question: QuestionDefinition,
  value: unknown,
): unknown {
  if (typeof value === "string") {
    const byValue = question.options.find((o) => String(o.value) === value);
    if (byValue) return byValue.value;
    const byLabel = question.options.find(
      (o) => o.label.toLowerCase() === value.toLowerCase(),
    );
    if (byLabel) return byLabel.value;
  }
  return value;
}

function normalizeAnswer(
  question: QuestionDefinition | null,
  value: unknown,
): unknown {
  if (!question) return value;
  const kind = questionKind(question);
  if (kind === "text") return value;
  if (kind === "multi") {
    const raw = Array.isArray(value)
      ? value
      : typeof value === "string"
        ? value.split(",")
        : [value];
    return raw.map((item) => normalizeSingle(question, item));
  }
  return normalizeSingle(question, value);
}

export function buildServer(options: ServerOptions): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? false });
  const { store } = options;
  const reconstructor = options.reconstructor ?? new TemplateReconstructor();

  app.get("/healthz", async () => ({ status: "ok", version: VERSION }));
  app.get("/readyz", async () => ({ status: "ok", counts: store.counts() }));

  app.post("/v1/fragments", async (req, reply) => {
    const body = req.body as
      | { kind?: string; content?: string; privacy?: string }
      | null;
    if (!body?.content || typeof body.content !== "string") {
      return reply
        .code(400)
        .send({ error: { code: "INVALID_FRAGMENT", message: "content is required" } });
    }
    const privacy =
      body.privacy === "team" || body.privacy === "public"
        ? body.privacy
        : "private";
    const fragment: Fragment = {
      id: newId("frg"),
      captured_at: new Date().toISOString(),
      kind: "text",
      content: body.content,
      privacy,
      source: "api",
      schema_version: "1.0.0",
    };
    store.putFragment(fragment);
    store.appendEvent("fragment.captured", fragment.id, { kind: fragment.kind });
    return reply.code(201).send(fragment);
  });

  app.get("/v1/fragments/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const fragment = store.getFragment(id);
    if (!fragment) {
      return reply
        .code(404)
        .send({ error: { code: "NOT_FOUND", message: `fragment not found: ${id}` } });
    }
    return fragment;
  });

  app.post("/v1/ideas", async (req, reply) => {
    const body = req.body as
      | { fragment_id?: string; vertical?: string }
      | null;
    if (!body?.fragment_id) {
      return reply.code(400).send({
        error: { code: "INVALID_IDEA", message: "fragment_id is required" },
      });
    }
    const fragment = store.getFragment(body.fragment_id);
    if (!fragment) {
      return reply.code(404).send({
        error: {
          code: "NOT_FOUND",
          message: `fragment not found: ${body.fragment_id}`,
        },
      });
    }
    const vertical = body.vertical ?? igem.id;
    if (vertical !== igem.id) {
      return reply.code(400).send({
        error: { code: "UNKNOWN_VERTICAL", message: `unknown vertical: ${vertical}` },
      });
    }
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
    });
    return reply
      .code(201)
      .send({ idea: result.idea, claims: result.claims, gates: result.gates });
  });

  app.get("/v1/ideas/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const idea = store.getIdea(id);
    if (!idea) {
      return reply
        .code(404)
        .send({ error: { code: "NOT_FOUND", message: `idea not found: ${id}` } });
    }
    const constraint =
      store.getConstraintState(id) ??
      createConstraintState(idea.vertical ?? igem.id, igem.questions);
    return {
      idea,
      claims: store.listClaims(id),
      gates: store.listGates(id),
      brief: store.getBriefByIdea(id),
      constraint,
      blocking: blockingQuestions(constraint, igem.questions).map(
        (q) => q.variable,
      ),
      next_question: nextQuestion(constraint, igem.questions),
    };
  });

  app.get("/v1/ideas/:id/constraints", async (req, reply) => {
    const { id } = req.params as { id: string };
    const idea = store.getIdea(id);
    if (!idea) {
      return reply
        .code(404)
        .send({ error: { code: "NOT_FOUND", message: `idea not found: ${id}` } });
    }
    const constraint =
      store.getConstraintState(id) ??
      createConstraintState(idea.vertical ?? igem.id, igem.questions);
    return {
      constraint,
      blocking: blockingQuestions(constraint, igem.questions).map(
        (q) => q.variable,
      ),
      next_question: nextQuestion(constraint, igem.questions),
    };
  });

  app.post("/v1/ideas/:id/constraints/answer", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as
      | { variable?: string; value?: unknown; confidence?: number }
      | null;
    const idea = store.getIdea(id);
    if (!idea) {
      return reply
        .code(404)
        .send({ error: { code: "NOT_FOUND", message: `idea not found: ${id}` } });
    }
    if (!body?.variable || body.value === undefined) {
      return reply.code(400).send({
        error: {
          code: "INVALID_CONSTRAINT",
          message: "variable and value are required",
        },
      });
    }
    const confidence = body.confidence ?? 1;
    if (confidence < 0 || confidence > 1) {
      return reply.code(400).send({
        error: {
          code: "INVALID_CONFIDENCE",
          message: "confidence must be between 0 and 1",
        },
      });
    }
    const state =
      store.getConstraintState(id) ??
      createConstraintState(idea.vertical ?? igem.id, igem.questions);
    const question = findQuestion(igem.questions, body.variable);
    const value = normalizeAnswer(question, body.value);
    const updated = answerConstraint(
      state,
      igem.questions,
      body.variable,
      value,
      confidence,
    );
    store.putConstraintState(id, updated);
    store.appendEvent("constraint.answered", id, { variable: body.variable });
    return {
      constraint: updated,
      blocking: blockingQuestions(updated, igem.questions).map(
        (q) => q.variable,
      ),
      next_question: nextQuestion(updated, igem.questions),
    };
  });

  app.post("/v1/ideas/:id/assumptions/:assumptionId/decide", async (req, reply) => {
    const { id, assumptionId } = req.params as {
      id: string;
      assumptionId: string;
    };
    const body = req.body as { status?: string } | null;
    const idea = store.getIdea(id);
    if (!idea) {
      return reply
        .code(404)
        .send({ error: { code: "NOT_FOUND", message: `idea not found: ${id}` } });
    }
    const status = body?.status;
    if (status !== "confirmed" && status !== "refuted") {
      return reply.code(400).send({
        error: {
          code: "INVALID_ASSUMPTION_STATUS",
          message: "status must be confirmed or refuted",
        },
      });
    }
    if (!idea.assumptions.some((a) => a.id === assumptionId)) {
      return reply.code(404).send({
        error: {
          code: "NOT_FOUND",
          message: `assumption not found: ${assumptionId}`,
        },
      });
    }
    const saved: Idea = {
      ...idea,
      assumptions: idea.assumptions.map((a) =>
        a.id === assumptionId
          ? { ...a, status: status as AssumptionStatus, decided_by: "human" }
          : a,
      ),
      version: idea.version + 1,
      updated_at: new Date().toISOString(),
    };
    store.putIdea(saved);
    store.appendEvent("assumption.decided", id, {
      assumption_id: assumptionId,
      status,
      decided_by: "human",
    });
    return saved;
  });

  app.post("/v1/ideas/:id/gates/:gateId/decide", async (req, reply) => {
    const { id, gateId } = req.params as { id: string; gateId: string };
    const body = req.body as { status?: string; reason?: string } | null;
    const idea = store.getIdea(id);
    if (!idea) {
      return reply
        .code(404)
        .send({ error: { code: "NOT_FOUND", message: `idea not found: ${id}` } });
    }
    const gates = store.listGates(id);
    const gate = gates.find((g) => g.id === gateId);
    if (!gate) {
      return reply
        .code(404)
        .send({ error: { code: "NOT_FOUND", message: `gate not found: ${gateId}` } });
    }
    const status = body?.status;
    if (
      status !== "pass" &&
      status !== "fail" &&
      status !== "unknown" &&
      status !== "waive"
    ) {
      return reply.code(400).send({
        error: {
          code: "INVALID_GATE_STATUS",
          message: "status must be pass, fail, unknown or waive",
        },
      });
    }
    const decided = decideGate(
      gate,
      status === "waive" ? "waived" : status,
      "human",
      body?.reason ?? null,
    );
    store.putGates(
      id,
      gates.map((g) => (g.id === gateId ? decided : g)),
    );
    store.appendEvent("gate.decided", id, {
      gate_id: gateId,
      status: decided.status,
      decided_by: "human",
    });
    return decided;
  });

  app.post("/v1/ideas/:id/brief", async (req, reply) => {
    const { id } = req.params as { id: string };
    const idea = store.getIdea(id);
    if (!idea) {
      return reply
        .code(404)
        .send({ error: { code: "NOT_FOUND", message: `idea not found: ${id}` } });
    }
    const claims = store.listClaims(id);
    const gates = store.listGates(id);

    const constraint = store.getConstraintState(id);
    const blocking = constraint
      ? blockingQuestions(constraint, igem.questions)
      : [];
    if (blocking.length > 0) {
      return reply.code(409).send({
        error: {
          code: "BLOCKING_CONSTRAINTS",
          message: "Answer the blocking constraints first.",
          details: blocking.map((q) => q.variable),
        },
      });
    }

    let next = idea;
    if (next.status === "developed") next = transition(next, "verifying");
    if (next.status === "verifying") next = transition(next, "viable");
    if (next.status === "viable") next = transition(next, "briefed");

    const brief = compileBrief({ idea: next, claims, gates });
    const saved: Idea = { ...next, brief_ref: brief.id };
    store.putBrief(brief);
    store.putIdea(saved);
    store.appendEvent("brief.compiled", id, { brief_id: brief.id });
    return reply.code(201).send(brief);
  });

  app.get("/v1/ideas/:id/brief", async (req, reply) => {
    const { id } = req.params as { id: string };
    const brief = store.getBriefByIdea(id);
    if (!brief) {
      return reply.code(404).send({
        error: { code: "NOT_FOUND", message: `brief not found for idea: ${id}` },
      });
    }
    return brief;
  });

  app.post("/v1/ideas/:id/outcome", async (req, reply) => {
    const { id } = req.params as { id: string };
    const idea = store.getIdea(id);
    if (!idea) {
      return reply
        .code(404)
        .send({ error: { code: "NOT_FOUND", message: `idea not found: ${id}` } });
    }
    const body = req.body as
      | {
          decision?: string;
          realised_success?: boolean;
          predicted_confidence?: number;
          predicted_at?: string | null;
          decided_by?: string;
          evidence?: string[];
          notes?: string | null;
        }
      | null;
    const decisions: OutcomeDecision[] = [
      "shipped",
      "tested",
      "parked",
      "killed",
      "failed",
    ];
    if (!body?.decision || !decisions.includes(body.decision as OutcomeDecision)) {
      return reply.code(400).send({
        error: {
          code: "INVALID_OUTCOME",
          message:
            "decision must be shipped, tested, parked, killed or failed",
        },
      });
    }
    if (typeof body.realised_success !== "boolean") {
      return reply.code(400).send({
        error: {
          code: "SUCCESS_REQUIRED",
          message: "realised_success must be recorded explicitly",
        },
      });
    }
    const maxConfidence = idea.hypotheses.reduce(
      (max, hypothesis) => Math.max(max, hypothesis.confidence),
      0,
    );
    const outcome = createOutcome({
      idea_id: idea.id,
      idea_version: idea.version,
      owner_id: "local",
      decision: body.decision as OutcomeDecision,
      realised_success: body.realised_success,
      predicted_confidence: body.predicted_confidence ?? maxConfidence,
      predicted_at: body.predicted_at ?? idea.updated_at ?? null,
      decided_by: body.decided_by === "expert" ? "expert" : "human",
      evidence: body.evidence ?? idea.claims,
      notes: body.notes ?? null,
    });
    store.putOutcome(outcome);
    store.putEdge(outcomeEdge(outcome));
    let saved = idea;
    if (idea.status === "briefed") {
      saved = transition(idea, "learned");
      store.putIdea(saved);
    }
    store.appendEvent("outcome.recorded", id, {
      outcome_id: outcome.id,
      decision: outcome.decision,
      realised_success: outcome.realised_success,
    });
    return reply.code(201).send(outcome);
  });

  app.get("/v1/ideas/:id/outcome", async (req, reply) => {
    const { id } = req.params as { id: string };
    const idea = store.getIdea(id);
    if (!idea) {
      return reply
        .code(404)
        .send({ error: { code: "NOT_FOUND", message: `idea not found: ${id}` } });
    }
    return { outcomes: store.listOutcomes({ ownerId: "local", ideaId: id }) };
  });

  app.get("/v1/calibration", async () => store.calibrationReport());

  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof BriefValidationError) {
      return reply.code(422).send({
        error: {
          code: "BRIEF_VALIDATION_FAILED",
          message: error.message,
          details: error.issues,
        },
      });
    }
    if (error instanceof OutcomeError) {
      return reply.code(400).send({
        error: { code: error.code, message: error.message },
      });
    }
    if (error instanceof ConstraintAnswerError) {
      return reply.code(400).send({
        error: {
          code: error.code,
          message: error.message,
          details: { variable: error.variable },
        },
      });
    }
    if (error instanceof TransitionError) {
      return reply.code(409).send({ error: { code: error.code, message: error.message } });
    }
    if (error instanceof GateError) {
      return reply.code(409).send({ error: { code: error.code, message: error.message } });
    }
    return reply
      .code(500)
      .send({
        error: {
          code: "INTERNAL",
          message: error instanceof Error ? error.message : String(error),
        },
      });
  });

  return app;
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const dbPath = process.env.LATENT_DB_PATH ?? "data/runtime/latent.sqlite";
  if (dbPath !== ":memory:") {
    mkdirSync(dirname(resolve(dbPath)), { recursive: true });
  }
  const store = new Store(dbPath);
  const app = buildServer({
    store,
    logger: true,
    reconstructor: reconstructorFromEnv(),
  });
  const port = Number(process.env.LATENT_PORT ?? 4310);
  app
    .listen({ port, host: "127.0.0.1" })
    .then(() => {
      console.error(`latent listening on http://127.0.0.1:${port}`);
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
}
