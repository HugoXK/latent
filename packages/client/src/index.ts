import type {
  Brief,
  BriefCollision,
  CalibrationReport,
  Claim,
  ConstraintState,
  Fragment,
  Gate,
  Idea,
  Outcome,
  QuestionPrior,
} from "@latent/core";
import type {
  ComponentInput,
  MaterialBalanceInput,
  TimelineInput,
} from "@latent/vertical-igem";

export interface QuestionOption {
  value: unknown;
  label: string;
  prior?: number;
}

export interface Question {
  id: string;
  variable: string;
  prompt: string;
  blocking?: boolean;
  options: QuestionOption[];
}

export interface ConstraintResponse {
  constraint: ConstraintState;
  blocking: string[];
  next_question: Question | null;
}

export interface IdeaBundle {
  idea: Idea;
  claims: Claim[];
  gates: Gate[];
  brief: Brief | null;
  constraint: ConstraintState;
  blocking: string[];
  next_question: Question | null;
}

export interface DevelopResponse {
  idea: Idea;
  claims: Claim[];
  gates: Gate[];
}

export interface Health {
  status: string;
  version: string;
}

export interface Ready {
  status: string;
  counts: Record<string, number>;
}

export interface PriorReport {
  outcome_sample_count: number;
  min_samples: number;
  questions: QuestionPrior[];
}

export interface OutcomeInput {
  decision: Outcome["decision"];
  realised_success: boolean;
  predicted_confidence?: number;
  predicted_at?: string | null;
  decided_by?: Outcome["decided_by"];
  evidence?: string[];
  notes?: string | null;
}

export interface CorpusDocumentInput {
  id: string;
  title: string;
  url: string;
  text: string;
  metadata?: Record<string, string | number | boolean>;
  fetched_at?: string;
}

export interface IngestResult {
  documents: number;
  snapshots_added: number;
  snapshots_cached: number;
}

export interface RetrievalHit {
  id: string;
  title: string;
  url: string;
  snippet: string;
  score: number;
  bm25: number;
  vector: number;
  rerank: number;
  metadata: Record<string, unknown>;
}

export interface RetrievalResponse {
  query: string;
  filters: Record<string, string | number | boolean>;
  hits: RetrievalHit[];
}

export interface BriefOptions {
  components?: ComponentInput[];
  timeline?: TimelineInput;
  material?: MaterialBalanceInput;
  collisions?: BriefCollision[];
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export class LatentApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "LatentApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export interface LatentClientOptions {
  token: string;
  baseUrl?: string;
  fetchImpl?: FetchLike;
}

export interface ClientOperation {
  operationId: string;
  method: "get" | "post";
  path: string;
}

/**
 * The client-side operation manifest. It is compared with the committed OpenAPI
 * spec in the test suite, so a route change without a client/spec update fails.
 */
export const CLIENT_OPERATIONS: readonly ClientOperation[] = [
  { operationId: "health", method: "get", path: "/healthz" },
  { operationId: "ready", method: "get", path: "/readyz" },
  { operationId: "captureFragment", method: "post", path: "/v1/fragments" },
  { operationId: "getFragment", method: "get", path: "/v1/fragments/{id}" },
  { operationId: "developIdea", method: "post", path: "/v1/ideas" },
  { operationId: "getIdea", method: "get", path: "/v1/ideas/{id}" },
  { operationId: "getConstraints", method: "get", path: "/v1/ideas/{id}/constraints" },
  { operationId: "answerConstraint", method: "post", path: "/v1/ideas/{id}/constraints/answer" },
  { operationId: "undoConstraint", method: "post", path: "/v1/ideas/{id}/constraints/undo" },
  { operationId: "decideAssumption", method: "post", path: "/v1/ideas/{id}/assumptions/{assumptionId}/decide" },
  { operationId: "decideGate", method: "post", path: "/v1/ideas/{id}/gates/{gateId}/decide" },
  { operationId: "compileBrief", method: "post", path: "/v1/ideas/{id}/brief" },
  { operationId: "getBrief", method: "get", path: "/v1/ideas/{id}/brief" },
  { operationId: "recordOutcome", method: "post", path: "/v1/ideas/{id}/outcome" },
  { operationId: "listOutcomes", method: "get", path: "/v1/ideas/{id}/outcome" },
  { operationId: "calibrationReport", method: "get", path: "/v1/calibration" },
  { operationId: "questionPriors", method: "get", path: "/v1/priors" },
  { operationId: "ingestCorpus", method: "post", path: "/v1/corpus" },
  { operationId: "retrieve", method: "post", path: "/v1/retrieval" },
];

export class LatentClient {
  readonly #baseUrl: string;
  readonly #token: string;
  readonly #fetch: FetchLike;

  constructor(options: LatentClientOptions) {
    if (options.token.trim() === "") throw new Error("token is required");
    this.#baseUrl = (options.baseUrl ?? "http://127.0.0.1:4310").replace(/\/+$/, "");
    this.#token = options.token;
    this.#fetch = options.fetchImpl ?? ((input, init) => globalThis.fetch(input, init));
  }

  async #request<T>(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
  ): Promise<T> {
    const response = await this.#fetch(`${this.#baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.#token}`,
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) {
      let parsed: ApiErrorBody | null = null;
      try {
        parsed = (await response.json()) as ApiErrorBody;
      } catch {
        parsed = null;
      }
      throw new LatentApiError(
        response.status,
        parsed?.error.code ?? "HTTP_ERROR",
        parsed?.error.message ?? `HTTP ${response.status}`,
        parsed?.error.details,
      );
    }
    return (await response.json()) as T;
  }

  health(): Promise<Health> {
    return this.#request<Health>("GET", "/healthz");
  }

  ready(): Promise<Ready> {
    return this.#request<Ready>("GET", "/readyz");
  }

  capture(input: {
    content: string;
    privacy?: Fragment["privacy"];
  }): Promise<Fragment> {
    return this.#request<Fragment>("POST", "/v1/fragments", input);
  }

  getFragment(id: string): Promise<Fragment> {
    return this.#request<Fragment>("GET", `/v1/fragments/${encodeURIComponent(id)}`);
  }

  develop(input: {
    fragment_id: string;
    vertical?: string;
  }): Promise<DevelopResponse> {
    return this.#request<DevelopResponse>("POST", "/v1/ideas", input);
  }

  getIdea(id: string): Promise<IdeaBundle> {
    return this.#request<IdeaBundle>("GET", `/v1/ideas/${encodeURIComponent(id)}`);
  }

  getConstraints(id: string): Promise<ConstraintResponse> {
    return this.#request<ConstraintResponse>(
      "GET",
      `/v1/ideas/${encodeURIComponent(id)}/constraints`,
    );
  }

  answer(
    id: string,
    input: { variable: string; value: unknown; confidence?: number },
  ): Promise<ConstraintResponse> {
    return this.#request<ConstraintResponse>(
      "POST",
      `/v1/ideas/${encodeURIComponent(id)}/constraints/answer`,
      input,
    );
  }

  undoConstraint(id: string): Promise<ConstraintResponse> {
    return this.#request<ConstraintResponse>(
      "POST",
      `/v1/ideas/${encodeURIComponent(id)}/constraints/undo`,
    );
  }

  decideAssumption(
    id: string,
    assumptionId: string,
    status: "confirmed" | "refuted",
  ): Promise<Idea> {
    return this.#request<Idea>(
      "POST",
      `/v1/ideas/${encodeURIComponent(id)}/assumptions/${encodeURIComponent(assumptionId)}/decide`,
      { status },
    );
  }

  decideGate(
    id: string,
    gateId: string,
    input: { status: "pass" | "fail" | "unknown" | "waive"; reason?: string | null },
  ): Promise<Gate> {
    return this.#request<Gate>(
      "POST",
      `/v1/ideas/${encodeURIComponent(id)}/gates/${encodeURIComponent(gateId)}/decide`,
      input,
    );
  }

  compileBrief(id: string, options: BriefOptions = {}): Promise<Brief> {
    return this.#request<Brief>(
      "POST",
      `/v1/ideas/${encodeURIComponent(id)}/brief`,
      options,
    );
  }

  getBrief(id: string): Promise<Brief> {
    return this.#request<Brief>(
      "GET",
      `/v1/ideas/${encodeURIComponent(id)}/brief`,
    );
  }

  recordOutcome(id: string, input: OutcomeInput): Promise<Outcome> {
    return this.#request<Outcome>(
      "POST",
      `/v1/ideas/${encodeURIComponent(id)}/outcome`,
      input,
    );
  }

  listOutcomes(id: string): Promise<{ outcomes: Outcome[] }> {
    return this.#request<{ outcomes: Outcome[] }>(
      "GET",
      `/v1/ideas/${encodeURIComponent(id)}/outcome`,
    );
  }

  calibration(): Promise<CalibrationReport> {
    return this.#request<CalibrationReport>("GET", "/v1/calibration");
  }

  priors(vertical?: string): Promise<PriorReport> {
    const query = vertical ? `?vertical=${encodeURIComponent(vertical)}` : "";
    return this.#request<PriorReport>("GET", `/v1/priors${query}`);
  }

  ingestCorpus(documents: CorpusDocumentInput[]): Promise<IngestResult> {
    return this.#request<IngestResult>("POST", "/v1/corpus", { documents });
  }

  retrieve(input: {
    query: string;
    limit?: number;
    filters?: Record<string, string | number | boolean>;
  }): Promise<RetrievalResponse> {
    return this.#request<RetrievalResponse>("POST", "/v1/retrieval", input);
  }
}
