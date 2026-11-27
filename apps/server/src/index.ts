import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import {
  BiosafetyError,
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
  DEFAULT_MIN_SAMPLES,
  decideGate,
  develop,
  developEdges,
  findQuestion,
  newId,
  nextQuestion,
  observationsFromOutcomes,
  outcomeEdge,
  runExistenceValidator,
  questionKind,
  questionPriors,
  transition,
  undoConstraint,
  verticalRulesValidator,
} from "@latent/core";
import type {
  AssumptionStatus,
  BriefCollision,
  Fragment,
  Idea,
  OutcomeDecision,
  QuestionDefinition,
} from "@latent/core";
import {
  TemplateReconstructor,
  existenceProviderFromEnv,
  reconstructorFromEnv,
} from "@latent/adapters";
import { EvidenceError, Store } from "@latent/store";
import type { IngestDocumentInput } from "@latent/store";
import { compileIgemBrief } from "@latent/vertical-igem";
import type {
  ComponentInput,
  MaterialBalanceInput,
  TimelineInput,
} from "@latent/vertical-igem";
import { verticalById } from "@latent/verticals";
import { LocalRetrievalIndex } from "@latent/retrieval";
import type { Reconstructor } from "@latent/core";

export const SCOPES = [
  "fragments:read",
  "fragments:write",
  "ideas:read",
  "ideas:write",
  "gates:run",
  "briefs:compile",
  "memory:read",
  "admin",
] as const;

export type ServerScope = (typeof SCOPES)[number] | "*";

export interface AuthTokenConfig {
  token: string;
  scopes: string[];
}

export interface RateLimitOptions {
  limit: number;
  windowMs: number;
}

export interface ServerOptions {
  store: Store;
  logger?: boolean;
  reconstructor?: Reconstructor;
  authToken?: string;
  authTokens?: AuthTokenConfig[];
  rateLimit?: RateLimitOptions;
  bodyLimit?: number;
  allowedOrigins?: string[];
}

interface AuthInfo {
  token: string;
  scopes: string[];
}

declare module "fastify" {
  interface FastifyRequest {
    auth: AuthInfo | null;
  }
}

const VERSION = "0.2.0-alpha.0";
const DEFAULT_RATE_LIMIT: RateLimitOptions = { limit: 120, windowMs: 60_000 };
const DEFAULT_BODY_LIMIT = 1_048_576;
const PUBLIC_DIR = fileURLToPath(new URL("../public/", import.meta.url));
const UI_HEADERS: Record<string, string> = {
  "Content-Security-Policy":
    "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

function serveUi(
  reply: FastifyReply,
  file: string,
  type: string,
): FastifyReply {
  for (const [name, value] of Object.entries(UI_HEADERS)) {
    reply.header(name, value);
  }
  return reply.type(type).send(readFileSync(join(PUBLIC_DIR, file)));
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function tokenKey(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function hostnameOf(host: string | undefined): string | null {
  if (!host) return null;
  if (host.startsWith("[")) {
    const end = host.indexOf("]");
    return end > 0 ? host.slice(1, end) : null;
  }
  return host.split(":")[0] ?? null;
}

function hostAllowed(host: string | undefined): boolean {
  const name = hostnameOf(host);
  if (name === null) return true;
  return name === "127.0.0.1" || name === "localhost" || name === "::1";
}

function originAllowed(
  origin: string | undefined,
  host: string | undefined,
  allowed: Set<string>,
): boolean {
  if (!origin) return true;
  if (allowed.has(origin)) return true;
  if (!host) return false;
  return origin === `http://${host}` || origin === `https://${host}`;
}

function createRateLimiter(options: RateLimitOptions) {
  const buckets = new Map<string, { count: number; resetAt: number }>();
  return (key: string, now = Date.now()): { limited: boolean; retryAfter: number } => {
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      return { limited: false, retryAfter: 0 };
    }
    bucket.count += 1;
    if (bucket.count > options.limit) {
      return {
        limited: true,
        retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
      };
    }
    return { limited: false, retryAfter: 0 };
  };
}

function scope(required: string) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const auth = req.auth;
    if (!auth) {
      return reply.code(401).send({
        error: { code: "UNAUTHENTICATED", message: "a bearer token is required" },
      });
    }
    if (!auth.scopes.includes("*") && !auth.scopes.includes(required)) {
      return reply.code(403).send({
        error: {
          code: "FORBIDDEN",
          message: `missing scope: ${required}`,
          details: { required },
        },
      });
    }
  };
}

function resolveLocalToken(): { token: string; source: string } {
  const envToken = process.env.LATENT_AUTH_TOKEN?.trim();
  if (envToken) return { token: envToken, source: "LATENT_AUTH_TOKEN" };
  const file = process.env.LATENT_AUTH_TOKEN_FILE ?? "data/runtime/auth-token";
  const path = resolve(file);
  try {
    const token = readFileSync(path, "utf8").trim();
    if (token) return { token, source: path };
  } catch {
    // fall through and create one
  }
  const token = randomBytes(32).toString("hex");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${token}\n`, { mode: 0o600 });
  return { token, source: path };
}

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
  const app = Fastify({
    logger: options.logger ?? false,
    bodyLimit: options.bodyLimit ?? DEFAULT_BODY_LIMIT,
  });
  const { store } = options;
  const reconstructor = options.reconstructor ?? new TemplateReconstructor();
  const rateLimited = createRateLimiter(options.rateLimit ?? DEFAULT_RATE_LIMIT);
  const tokens: AuthTokenConfig[] = options.authTokens ?? [
    {
      token: options.authToken ?? randomBytes(32).toString("hex"),
      scopes: [...SCOPES],
    },
  ];
  const allowedOrigins = new Set(options.allowedOrigins ?? []);

  app.decorateRequest("auth", null);
  app.addHook("preHandler", async (req, reply) => {
    if (!hostAllowed(req.headers.host)) {
      return reply.code(403).send({
        error: {
          code: "HOST_NOT_ALLOWED",
          message: "unexpected Host header; bind to loopback",
        },
      });
    }
    if (!originAllowed(req.headers.origin, req.headers.host, allowedOrigins)) {
      return reply.code(403).send({
        error: {
          code: "CSRF_FAILED",
          message: "cross-origin request refused",
        },
      });
    }
    const path = req.url.split("?")[0] ?? req.url;
    if (
      path === "/healthz" ||
      path === "/readyz" ||
      path === "/" ||
      path.startsWith("/ui/")
    ) {
      return;
    }

    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (token === "") {
      return reply.code(401).send({
        error: {
          code: "UNAUTHENTICATED",
          message: "a bearer token is required",
        },
      });
    }
    const match = tokens.find((candidate) => safeEqual(candidate.token, token));
    if (!match) {
      return reply.code(401).send({
        error: {
          code: "UNAUTHENTICATED",
          message: "invalid bearer token",
        },
      });
    }
    const limit = rateLimited(tokenKey(token));
    if (limit.limited) {
      reply.header("Retry-After", String(limit.retryAfter));
      return reply.code(429).send({
        error: {
          code: "RATE_LIMITED",
          message: "rate limit exceeded",
          details: { retry_after_seconds: limit.retryAfter },
        },
      });
    }
    req.auth = { token: match.token, scopes: match.scopes };
  });

  app.get("/", async (_req, reply) =>
    serveUi(reply, "index.html", "text/html; charset=utf-8"),
  );
  app.get("/ui/app.js", async (_req, reply) =>
    serveUi(reply, "app.js", "text/javascript; charset=utf-8"),
  );
  app.get("/ui/style.css", async (_req, reply) =>
    serveUi(reply, "style.css", "text/css; charset=utf-8"),
  );

  app.get("/healthz", async () => ({ status: "ok", version: VERSION }));
  app.get("/readyz", async () => ({ status: "ok", counts: store.counts() }));

  app.post("/v1/fragments", { preHandler: scope("fragments:write") }, async (req, reply) => {
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

  app.get("/v1/fragments/:id", { preHandler: scope("fragments:read") }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const fragment = store.getFragment(id);
    if (!fragment) {
      return reply
        .code(404)
        .send({ error: { code: "NOT_FOUND", message: `fragment not found: ${id}` } });
    }
    return fragment;
  });

  app.post("/v1/ideas", { preHandler: scope("ideas:write") }, async (req, reply) => {
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
    const verticalId = body.vertical ?? "igem";
    let pack;
    try {
      pack = verticalById(verticalId);
    } catch {
      return reply.code(400).send({
        error: {
          code: "UNKNOWN_VERTICAL",
          message: `unknown vertical: ${verticalId}`,
        },
      });
    }
    let result;
    try {
      result = await develop({ fragment, vertical: pack, reconstructor });
    } catch (error) {
      if (error instanceof BiosafetyError) {
        store.appendEvent("biosafety.refused", fragment.id, {
          category: error.verdict.category,
          bsl: error.verdict.bsl,
        });
        return reply.code(422).send({
          error: {
            code: error.code,
            message: error.message,
            details: {
              category: error.verdict.category,
              bsl: error.verdict.bsl,
            },
          },
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
    });
    return reply
      .code(201)
      .send({ idea: result.idea, claims: result.claims, gates: result.gates });
  });

  app.get("/v1/ideas/:id", { preHandler: scope("ideas:read") }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const idea = store.getIdea(id);
    if (!idea) {
      return reply
        .code(404)
        .send({ error: { code: "NOT_FOUND", message: `idea not found: ${id}` } });
    }
    const pack = verticalById(idea.vertical ?? "igem");
    const constraint =
      store.getConstraintState(id) ??
      createConstraintState(pack.id, pack.questions);
    return {
      idea,
      claims: store.listClaims(id),
      gates: store.listGates(id),
      brief: store.getBriefByIdea(id),
      constraint,
      blocking: blockingQuestions(constraint, pack.questions).map(
        (q) => q.variable,
      ),
      next_question: nextQuestion(constraint, pack.questions),
    };
  });

  app.get("/v1/ideas/:id/constraints", { preHandler: scope("ideas:read") }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const idea = store.getIdea(id);
    if (!idea) {
      return reply
        .code(404)
        .send({ error: { code: "NOT_FOUND", message: `idea not found: ${id}` } });
    }
    const pack = verticalById(idea.vertical ?? "igem");
    const constraint =
      store.getConstraintState(id) ??
      createConstraintState(pack.id, pack.questions);
    return {
      constraint,
      blocking: blockingQuestions(constraint, pack.questions).map(
        (q) => q.variable,
      ),
      next_question: nextQuestion(constraint, pack.questions),
    };
  });

  app.post("/v1/ideas/:id/constraints/answer", { preHandler: scope("ideas:write") }, async (req, reply) => {
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
    const pack = verticalById(idea.vertical ?? "igem");
    const state =
      store.getConstraintState(id) ??
      createConstraintState(pack.id, pack.questions);
    const question = findQuestion(pack.questions, body.variable);
    const value = normalizeAnswer(question, body.value);
    const updated = answerConstraint(
      state,
      pack.questions,
      body.variable,
      value,
      confidence,
    );
    store.putConstraintState(id, updated);
    store.appendEvent("constraint.answered", id, {
      variable: body.variable,
      value,
      version_before: state.version,
      version_after: updated.version,
      before: state,
      after: updated,
    });
    return {
      constraint: updated,
      blocking: blockingQuestions(updated, pack.questions).map(
        (q) => q.variable,
      ),
      next_question: nextQuestion(updated, pack.questions),
    };
  });

  app.post("/v1/ideas/:id/constraints/undo", { preHandler: scope("ideas:write") }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const idea = store.getIdea(id);
    if (!idea) {
      return reply
        .code(404)
        .send({ error: { code: "NOT_FOUND", message: `idea not found: ${id}` } });
    }
    const pack = verticalById(idea.vertical ?? "igem");
    const state =
      store.getConstraintState(id) ??
      createConstraintState(pack.id, pack.questions);
    const answers = store
      .listEvents(id)
      .filter((event) => event.type === "constraint.answered");
    const last = answers[answers.length - 1];
    if (!last) {
      return reply.code(409).send({
        error: {
          code: "NOTHING_TO_UNDO",
          message: "no constraint answer to undo",
        },
      });
    }
    const payload = last.data as { before?: typeof state };
    if (!payload.before) {
      return reply.code(409).send({
        error: {
          code: "NO_SNAPSHOT",
          message: "the last constraint answer has no state snapshot",
        },
      });
    }
    const restored = undoConstraint(state, payload.before, pack.questions);
    store.putConstraintState(id, restored);
    store.appendEvent("constraint.undone", id, {
      event_id: last.id,
      before: state,
      after: restored,
    });
    return {
      constraint: restored,
      blocking: blockingQuestions(restored, pack.questions).map(
        (question) => question.variable,
      ),
      next_question: nextQuestion(restored, pack.questions),
    };
  });

  app.post("/v1/ideas/:id/assumptions/:assumptionId/decide", { preHandler: scope("ideas:write") }, async (req, reply) => {
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

  app.post("/v1/ideas/:id/gates/:gateId/decide", { preHandler: scope("gates:run") }, async (req, reply) => {
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

  app.post("/v1/ideas/:id/brief", { preHandler: scope("briefs:compile") }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const idea = store.getIdea(id);
    if (!idea) {
      return reply
        .code(404)
        .send({ error: { code: "NOT_FOUND", message: `idea not found: ${id}` } });
    }
    const pack = verticalById(idea.vertical ?? "igem");
    const body = req.body as
      | {
          components?: ComponentInput[];
          timeline?: TimelineInput;
          material?: MaterialBalanceInput;
          collisions?: BriefCollision[];
        }
      | null;
    if (
      (body?.components !== undefined && !Array.isArray(body.components)) ||
      (body?.collisions !== undefined && !Array.isArray(body.collisions)) ||
      (body?.timeline !== undefined &&
        (typeof body.timeline !== "object" || body.timeline === null)) ||
      (body?.material !== undefined &&
        (typeof body.material !== "object" || body.material === null))
    ) {
      return reply.code(400).send({
        error: {
          code: "INVALID_BRIEF_INPUT",
          message: "components and collisions are arrays; timeline and material are objects",
        },
      });
    }
    if (
      pack.id !== "igem" &&
      (body?.components || body?.timeline || body?.material)
    ) {
      return reply.code(400).send({
        error: {
          code: "INVALID_BRIEF_INPUT",
          message: "components/timeline/material apply to the igem vertical only",
        },
      });
    }
    const claims = store.listClaims(id);
    const gates = store.listGates(id);

    const constraint = store.getConstraintState(id);
    const blocking = constraint
      ? blockingQuestions(constraint, pack.questions)
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

    const existence = await runExistenceValidator(
      claims,
      existenceProviderFromEnv(),
    );
    const brief =
      pack.id === "igem"
        ? compileIgemBrief({
            idea: next,
            claims: existence.claims,
            gates,
            components: body?.components,
            timeline: body?.timeline,
            material: body?.material,
            collisions: body?.collisions,
            validators: { existence: existence.validator },
            strictValidators: true,
          })
        : compileBrief({
            idea: next,
            claims: existence.claims,
            gates,
            collisions: body?.collisions,
            validators: {
              existence: existence.validator,
              vertical_rules: verticalRulesValidator(pack),
            },
            strictValidators: true,
          });
    const saved: Idea = { ...next, brief_ref: brief.id };
    store.putBrief(brief);
    store.putIdea(saved);
    store.appendEvent("brief.compiled", id, { brief_id: brief.id });
    return reply.code(201).send(brief);
  });

  app.get("/v1/ideas/:id/brief", { preHandler: scope("ideas:read") }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const brief = store.getBriefByIdea(id);
    if (!brief) {
      return reply.code(404).send({
        error: { code: "NOT_FOUND", message: `brief not found for idea: ${id}` },
      });
    }
    return brief;
  });

  app.post("/v1/ideas/:id/outcome", { preHandler: scope("ideas:write") }, async (req, reply) => {
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

  app.get("/v1/ideas/:id/outcome", { preHandler: scope("ideas:read") }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const idea = store.getIdea(id);
    if (!idea) {
      return reply
        .code(404)
        .send({ error: { code: "NOT_FOUND", message: `idea not found: ${id}` } });
    }
    return { outcomes: store.listOutcomes({ ownerId: "local", ideaId: id }) };
  });

  app.get("/v1/calibration", { preHandler: scope("memory:read") }, async () => store.calibrationReport());

  app.get("/v1/priors", { preHandler: scope("memory:read") }, async (req, reply) => {
    const query = req.query as { vertical?: string };
    let pack;
    try {
      pack = verticalById(query.vertical ?? "igem");
    } catch {
      return reply.code(400).send({
        error: {
          code: "UNKNOWN_VERTICAL",
          message: `unknown vertical: ${query.vertical ?? ""}`,
        },
      });
    }
    const outcomes = store.listOutcomes({ ownerId: "local" });
    const states = new Map(
      store.listConstraintStates().map((entry) => [entry.ideaId, entry.state]),
    );
    const observations = observationsFromOutcomes(
      outcomes,
      states,
      pack.questions,
    );
    return {
      vertical: pack.id,
      outcome_sample_count: outcomes.length,
      min_samples: DEFAULT_MIN_SAMPLES,
      questions: questionPriors(pack.questions, observations),
    };
  });

  app.post("/v1/corpus", { preHandler: scope("ideas:write") }, async (req, reply) => {
    const body = req.body as { documents?: IngestDocumentInput[] } | null;
    if (!Array.isArray(body?.documents) || body.documents.length === 0) {
      return reply.code(400).send({
        error: {
          code: "INVALID_CORPUS",
          message: "documents must be a non-empty array",
        },
      });
    }
    try {
      return reply.code(201).send(store.ingestDocuments(body.documents));
    } catch (error) {
      if (error instanceof EvidenceError) {
        return reply.code(400).send({
          error: { code: error.code, message: error.message },
        });
      }
      throw error;
    }
  });

  app.post("/v1/retrieval", { preHandler: scope("memory:read") }, async (req, reply) => {
    const body = req.body as
      | {
          query?: string;
          limit?: number;
          filters?: Record<string, string | number | boolean>;
        }
      | null;
    if (!body?.query || body.query.trim() === "") {
      return reply.code(400).send({
        error: { code: "INVALID_QUERY", message: "query is required" },
      });
    }
    const documents = store.listRetrievalDocuments();
    if (documents.length === 0) {
      return reply.code(409).send({
        error: {
          code: "NO_CORPUS",
          message: "no documents indexed; ingest a corpus first",
        },
      });
    }
    const limit = Math.max(1, Math.min(50, Math.trunc(body.limit ?? 10)));
    const index = await LocalRetrievalIndex.build(
      documents.map((document) => ({
        ...document,
        snapshot_hash: document.snapshot_hash ?? undefined,
      })),
    );
    const hits = await index.searchDetailed({
      text: body.query,
      filters: body.filters ?? {},
      limit,
    });
    return { query: body.query, filters: body.filters ?? {}, hits };
  });

  app.setErrorHandler((error, _req, reply) => {
    const fastifyError = error as { code?: string; statusCode?: number };
    if (
      fastifyError.code === "FST_ERR_CTP_BODY_TOO_LARGE" ||
      fastifyError.statusCode === 413
    ) {
      return reply.code(413).send({
        error: {
          code: "BODY_TOO_LARGE",
          message: "request body exceeds the limit",
        },
      });
    }
    if (error instanceof BiosafetyError) {
      return reply.code(422).send({
        error: {
          code: error.code,
          message: error.message,
          details: {
            category: error.verdict.category,
            bsl: error.verdict.bsl,
          },
        },
      });
    }
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
  const auth = resolveLocalToken();
  const app = buildServer({
    store,
    logger: true,
    reconstructor: reconstructorFromEnv(),
    authToken: auth.token,
  });
  const port = Number(process.env.LATENT_PORT ?? 4310);
  app
    .listen({ port, host: "127.0.0.1" })
    .then(() => {
      console.error(`latent listening on http://127.0.0.1:${port}`);
      console.error(
        `latent auth token: ${auth.source} (set LATENT_AUTH_TOKEN to override; do not commit it)`,
      );
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
}
