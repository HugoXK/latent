import { DatabaseSync } from "node:sqlite";
import {
  assertValid,
  buildDigest as buildDigestView,
  calibrationReport as buildCalibrationReport,
  createSnapshot,
  decideSuggestion as applySuggestionDecision,
  explainConnection,
  newId,
} from "@latent/core";
import type {
  Brief,
  CalibrationReport,
  Claim,
  ConstraintState,
  ContentSnapshot,
  Digest,
  Fragment,
  Gate,
  Idea,
  IdeaStatus,
  Job,
  JobKind,
  JobStatus,
  MemoryEdge,
  MemoryNodeRef,
  MemoryNodeType,
  MemoryRelation,
  Outcome,
  Suggestion,
  SuggestionStatus,
} from "@latent/core";

/**
 * Migrations are ordered and applied through `PRAGMA user_version`. A new shape
 * adds a migration; it never rewrites history in place.
 */
const BASE_SCHEMA = `
CREATE TABLE IF NOT EXISTS fragments (
  id TEXT PRIMARY KEY,
  captured_at TEXT NOT NULL,
  data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ideas (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  version INTEGER NOT NULL,
  data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS claims (
  id TEXT PRIMARY KEY,
  idea_id TEXT NOT NULL,
  status TEXT NOT NULL,
  data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS gates (
  id TEXT PRIMARY KEY,
  idea_id TEXT NOT NULL,
  status TEXT NOT NULL,
  data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS briefs (
  id TEXT PRIMARY KEY,
  idea_id TEXT NOT NULL,
  data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS constraint_states (
  idea_id TEXT PRIMARY KEY,
  data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  at TEXT NOT NULL,
  type TEXT NOT NULL,
  subject TEXT NOT NULL,
  data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_claims_idea ON claims(idea_id);
CREATE INDEX IF NOT EXISTS idx_gates_idea ON gates(idea_id);
CREATE INDEX IF NOT EXISTS idx_briefs_idea ON briefs(idea_id);
CREATE INDEX IF NOT EXISTS idx_events_subject ON events(subject);
`;

const MEMORY_SCHEMA = `
ALTER TABLE fragments ADD COLUMN deleted_at TEXT;
CREATE TABLE IF NOT EXISTS edges (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  from_type TEXT NOT NULL,
  from_id TEXT NOT NULL,
  to_type TEXT NOT NULL,
  to_id TEXT NOT NULL,
  relation TEXT NOT NULL,
  weight REAL NOT NULL,
  created_at TEXT NOT NULL,
  deleted_at TEXT,
  data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_edges_owner ON edges(owner_id);
CREATE INDEX IF NOT EXISTS idx_edges_from ON edges(from_type, from_id);
CREATE INDEX IF NOT EXISTS idx_edges_to ON edges(to_type, to_id);
`;

const OUTCOME_SCHEMA = `
CREATE TABLE IF NOT EXISTS outcomes (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  idea_id TEXT NOT NULL,
  decision TEXT NOT NULL,
  realised_success INTEGER NOT NULL,
  predicted_confidence REAL NOT NULL,
  decided_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_outcomes_owner ON outcomes(owner_id);
CREATE INDEX IF NOT EXISTS idx_outcomes_idea ON outcomes(idea_id);
`;

const INCUBATION_SCHEMA = `
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  budget REAL NOT NULL,
  spent REAL NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_jobs_owner_status ON jobs(owner_id, status);
CREATE TABLE IF NOT EXISTS suggestions (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  score REAL NOT NULL,
  created_at TEXT NOT NULL,
  data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_suggestions_owner_status ON suggestions(owner_id, status);
CREATE INDEX IF NOT EXISTS idx_suggestions_job ON suggestions(job_id);
`;

const EVIDENCE_SCHEMA = `
CREATE TABLE IF NOT EXISTS snapshots (
  hash TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  title TEXT,
  fetched_at TEXT NOT NULL,
  content TEXT NOT NULL,
  data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_snapshots_url ON snapshots(url);
CREATE TABLE IF NOT EXISTS retrieval_documents (
  id TEXT PRIMARY KEY,
  snapshot_hash TEXT,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  text TEXT NOT NULL,
  metadata TEXT NOT NULL,
  data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_retrieval_snapshot ON retrieval_documents(snapshot_hash);
`;

const MIGRATIONS: readonly string[] = [
  BASE_SCHEMA,
  MEMORY_SCHEMA,
  OUTCOME_SCHEMA,
  INCUBATION_SCHEMA,
  EVIDENCE_SCHEMA,
];

type Row = { data: string };

function parse<T>(row: Row | undefined): T | null {
  return row ? (JSON.parse(row.data) as T) : null;
}

export interface ListEdgeOptions {
  ownerId?: string;
  node?: MemoryNodeRef;
  relation?: MemoryRelation;
  includeDeleted?: boolean;
}

export interface MemorySearchHit {
  type: MemoryNodeType;
  id: string;
  label: string;
}

export interface MemoryExport {
  schema_version: "1.0.0";
  exported_at: string;
  owner_id: string;
  nodes: MemoryNodeRef[];
  edges: MemoryEdge[];
}

export interface DeleteFragmentResult {
  deleted: boolean;
  reason?: "not_found" | "in_use";
  orphanedIdeas: string[];
}

export interface ListOutcomeOptions {
  ownerId?: string;
  ideaId?: string;
}

export interface ListJobOptions {
  ownerId?: string;
  status?: JobStatus;
}

export interface ListSuggestionOptions {
  ownerId?: string;
  status?: SuggestionStatus;
  jobId?: string;
}

export interface StoredRetrievalDocument {
  id: string;
  title: string;
  url: string;
  text: string;
  metadata: Record<string, string | number | boolean | undefined>;
  snapshot_hash?: string | null;
}

export interface IngestDocumentInput {
  id: string;
  title: string;
  url: string;
  text: string;
  metadata?: Record<string, string | number | boolean | undefined>;
  fetched_at?: string;
}

export interface IngestResult {
  documents: number;
  snapshots_added: number;
  snapshots_cached: number;
}

export class EvidenceError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "EvidenceError";
    this.code = code;
  }
}

export class JobError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "JobError";
    this.code = code;
  }
}

export const MAX_OPEN_JOBS = 4;
export const MAX_JOB_BUDGET = 100;

export class Store {
  readonly #db: DatabaseSync;

  constructor(path = ":memory:") {
    this.#db = new DatabaseSync(path);
    this.#db.exec("PRAGMA journal_mode = WAL;");
    this.#db.exec("PRAGMA foreign_keys = ON;");
    this.#db.exec("PRAGMA busy_timeout = 5000;");
    this.#migrate();
  }

  #migrate(): void {
    const row = this.#db.prepare("PRAGMA user_version").get() as
      | { user_version: number }
      | undefined;
    const current = Number(row?.user_version ?? 0);
    for (let index = current; index < MIGRATIONS.length; index += 1) {
      const sql = MIGRATIONS[index];
      if (sql === undefined) continue;
      this.#db.exec("BEGIN");
      try {
        this.#db.exec(sql);
        this.#db.exec(`PRAGMA user_version = ${index + 1}`);
        this.#db.exec("COMMIT");
      } catch (error) {
        this.#db.exec("ROLLBACK");
        throw error;
      }
    }
  }

  schemaVersion(): number {
    const row = this.#db.prepare("PRAGMA user_version").get() as
      | { user_version: number }
      | undefined;
    return Number(row?.user_version ?? 0);
  }

  close(): void {
    this.#db.close();
  }

  // --- fragments -----------------------------------------------------------

  putFragment(fragment: Fragment): void {
    assertValid("fragment", fragment);
    this.#db
      .prepare(
        `INSERT INTO fragments (id, captured_at, data) VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET data = excluded.data`,
      )
      .run(fragment.id, fragment.captured_at, JSON.stringify(fragment));
  }

  getFragment(id: string): Fragment | null {
    const row = this.#db
      .prepare("SELECT data FROM fragments WHERE id = ? AND deleted_at IS NULL")
      .get(id) as Row | undefined;
    return parse<Fragment>(row);
  }

  listFragments(): Fragment[] {
    const rows = this.#db
      .prepare("SELECT data FROM fragments WHERE deleted_at IS NULL ORDER BY id")
      .all() as Row[];
    return rows.map((row) => JSON.parse(row.data) as Fragment);
  }

  // --- ideas ---------------------------------------------------------------

  putIdea(idea: Idea): void {
    assertValid("idea", idea);
    this.#db
      .prepare(
        `INSERT INTO ideas (id, status, version, data) VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           status = excluded.status,
           version = excluded.version,
           data = excluded.data`,
      )
      .run(idea.id, idea.status, idea.version, JSON.stringify(idea));
  }

  getIdea(id: string): Idea | null {
    const row = this.#db
      .prepare("SELECT data FROM ideas WHERE id = ?")
      .get(id) as Row | undefined;
    return parse<Idea>(row);
  }

  listIdeas(status?: IdeaStatus): Idea[] {
    const rows = status
      ? (this.#db
          .prepare("SELECT data FROM ideas WHERE status = ? ORDER BY id")
          .all(status) as Row[])
      : (this.#db.prepare("SELECT data FROM ideas ORDER BY id").all() as Row[]);
    return rows.map((r) => JSON.parse(r.data) as Idea);
  }

  // --- claims --------------------------------------------------------------

  putClaims(ideaId: string, claims: Claim[]): void {
    for (const claim of claims) assertValid("claim", claim);
    const stmt = this.#db.prepare(
      `INSERT INTO claims (id, idea_id, status, data) VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET status = excluded.status, data = excluded.data`,
    );
    for (const claim of claims) {
      stmt.run(claim.id, ideaId, claim.status, JSON.stringify(claim));
    }
  }

  listClaims(ideaId: string): Claim[] {
    const rows = this.#db
      .prepare("SELECT data FROM claims WHERE idea_id = ? ORDER BY id")
      .all(ideaId) as Row[];
    return rows.map((r) => JSON.parse(r.data) as Claim);
  }

  // --- gates ---------------------------------------------------------------

  putGates(ideaId: string, gates: Gate[]): void {
    for (const gate of gates) assertValid("gate", gate);
    const stmt = this.#db.prepare(
      `INSERT INTO gates (id, idea_id, status, data) VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET status = excluded.status, data = excluded.data`,
    );
    for (const gate of gates) {
      stmt.run(gate.id, ideaId, gate.status, JSON.stringify(gate));
    }
  }

  getGate(id: string): Gate | null {
    const row = this.#db
      .prepare("SELECT data FROM gates WHERE id = ?")
      .get(id) as Row | undefined;
    return parse<Gate>(row);
  }

  listGates(ideaId: string): Gate[] {
    const rows = this.#db
      .prepare("SELECT data FROM gates WHERE idea_id = ? ORDER BY id")
      .all(ideaId) as Row[];
    return rows.map((r) => JSON.parse(r.data) as Gate);
  }

  // --- briefs --------------------------------------------------------------

  putBrief(brief: Brief): void {
    assertValid("brief", brief);
    this.#db
      .prepare(
        `INSERT INTO briefs (id, idea_id, data) VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET data = excluded.data`,
      )
      .run(brief.id, brief.idea_id, JSON.stringify(brief));
  }

  getBrief(id: string): Brief | null {
    const row = this.#db
      .prepare("SELECT data FROM briefs WHERE id = ?")
      .get(id) as Row | undefined;
    return parse<Brief>(row);
  }

  getBriefByIdea(ideaId: string): Brief | null {
    const row = this.#db
      .prepare("SELECT data FROM briefs WHERE idea_id = ? ORDER BY id DESC LIMIT 1")
      .get(ideaId) as Row | undefined;
    return parse<Brief>(row);
  }

  // --- constraints ---------------------------------------------------------

  putConstraintState(ideaId: string, state: ConstraintState): void {
    assertValid("constraint", state);
    this.#db
      .prepare(
        `INSERT INTO constraint_states (idea_id, data) VALUES (?, ?)
         ON CONFLICT(idea_id) DO UPDATE SET data = excluded.data`,
      )
      .run(ideaId, JSON.stringify(state));
  }

  getConstraintState(ideaId: string): ConstraintState | null {
    const row = this.#db
      .prepare("SELECT data FROM constraint_states WHERE idea_id = ?")
      .get(ideaId) as Row | undefined;
    return parse<ConstraintState>(row);
  }

  listConstraintStates(): Array<{ ideaId: string; state: ConstraintState }> {
    const rows = this.#db
      .prepare(
        "SELECT idea_id, data FROM constraint_states ORDER BY idea_id",
      )
      .all() as Array<{ idea_id: string; data: string }>;
    return rows.map((row) => ({
      ideaId: row.idea_id,
      state: JSON.parse(row.data) as ConstraintState,
    }));
  }

  // --- memory graph --------------------------------------------------------

  putEdge(edge: MemoryEdge): void {
    assertValid("edge", edge);
    this.#db
      .prepare(
        `INSERT INTO edges
           (id, owner_id, from_type, from_id, to_type, to_id, relation, weight, created_at, deleted_at, data)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           owner_id = excluded.owner_id,
           from_type = excluded.from_type,
           from_id = excluded.from_id,
           to_type = excluded.to_type,
           to_id = excluded.to_id,
           relation = excluded.relation,
           weight = excluded.weight,
           created_at = excluded.created_at,
           deleted_at = excluded.deleted_at,
           data = excluded.data`,
      )
      .run(
        edge.id,
        edge.owner_id,
        edge.from.type,
        edge.from.id,
        edge.to.type,
        edge.to.id,
        edge.relation,
        edge.weight ?? 1,
        edge.created_at,
        edge.deleted_at ?? null,
        JSON.stringify(edge),
      );
  }

  getEdge(id: string): MemoryEdge | null {
    const row = this.#db
      .prepare("SELECT data FROM edges WHERE id = ?")
      .get(id) as Row | undefined;
    return parse<MemoryEdge>(row);
  }

  listEdges(options: ListEdgeOptions = {}): MemoryEdge[] {
    const clauses: string[] = [];
    const params: Array<string | number> = [];
    if (options.ownerId !== undefined) {
      clauses.push("owner_id = ?");
      params.push(options.ownerId);
    }
    if (options.node) {
      clauses.push(
        "((from_type = ? AND from_id = ?) OR (to_type = ? AND to_id = ?))",
      );
      params.push(
        options.node.type,
        options.node.id,
        options.node.type,
        options.node.id,
      );
    }
    if (options.relation !== undefined) {
      clauses.push("relation = ?");
      params.push(options.relation);
    }
    if (options.includeDeleted !== true) {
      clauses.push("deleted_at IS NULL");
    }
    const where = clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "";
    const rows = this.#db
      .prepare(`SELECT data FROM edges${where} ORDER BY id`)
      .all(...params) as Row[];
    return rows.map((row) => JSON.parse(row.data) as MemoryEdge);
  }

  connectionExplanation(
    from: MemoryNodeRef,
    to: MemoryNodeRef,
    options: { ownerId?: string; maxDepth?: number } = {},
  ): ReturnType<typeof explainConnection> {
    const edges = this.listEdges({
      ownerId: options.ownerId,
      includeDeleted: false,
    });
    return explainConnection(edges, from, to, options.maxDepth ?? 3);
  }

  searchMemory(
    query: string,
    options: { ownerId?: string; limit?: number } = {},
  ): MemorySearchHit[] {
    const term = query.trim().toLowerCase();
    if (term === "") return [];
    const limit = Math.max(1, Math.min(100, Math.trunc(options.limit ?? 20)));
    const fragmentRows = this.#db
      .prepare("SELECT data FROM fragments WHERE deleted_at IS NULL ORDER BY id")
      .all() as Row[];
    const ideaRows = this.#db
      .prepare("SELECT data FROM ideas ORDER BY id")
      .all() as Row[];

    const hits: MemorySearchHit[] = [
      ...fragmentRows
        .map((row) => JSON.parse(row.data) as Fragment)
        .filter((fragment) => fragment.content.toLowerCase().includes(term))
        .map((fragment) => ({
          type: "fragment" as const,
          id: fragment.id,
          label: fragment.content.slice(0, 80),
        })),
      ...ideaRows
        .map((row) => JSON.parse(row.data) as Idea)
        .filter(
          (idea) =>
            idea.title.toLowerCase().includes(term) ||
            idea.one_liner.toLowerCase().includes(term),
        )
        .map((idea) => ({
          type: "idea" as const,
          id: idea.id,
          label: idea.title || idea.one_liner,
        })),
    ];
    hits.sort((a, b) =>
      `${a.type}:${a.id}`.localeCompare(`${b.type}:${b.id}`),
    );
    return hits.slice(0, limit);
  }

  exportMemory(options: { ownerId?: string; now?: string } = {}): MemoryExport {
    const ownerId = options.ownerId ?? "local";
    const edges = this.listEdges({ ownerId });
    const nodes = new Map<string, MemoryNodeRef>();
    for (const edge of edges) {
      for (const ref of [edge.from, edge.to]) {
        nodes.set(`${ref.type}:${ref.id}`, ref);
      }
    }
    return {
      schema_version: "1.0.0",
      exported_at: options.now ?? new Date().toISOString(),
      owner_id: ownerId,
      nodes: [...nodes.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([, ref]) => ref),
      edges,
    };
  }

  deleteFragment(
    id: string,
    options: {
      policy?: "block" | "mark";
      ownerId?: string;
      now?: string;
    } = {},
  ): DeleteFragmentResult {
    const row = this.#db
      .prepare("SELECT deleted_at FROM fragments WHERE id = ?")
      .get(id) as { deleted_at: string | null } | undefined;
    if (!row || row.deleted_at !== null) {
      return { deleted: false, reason: "not_found", orphanedIdeas: [] };
    }

    const orphanedIdeas = this.listIdeas()
      .filter((idea) => idea.fragment_ids?.includes(id) === true)
      .map((idea) => idea.id)
      .sort();
    const policy = options.policy ?? "block";
    if (policy === "block" && orphanedIdeas.length > 0) {
      return { deleted: false, reason: "in_use", orphanedIdeas };
    }

    const now = options.now ?? new Date().toISOString();
    this.#db.exec("BEGIN");
    try {
      this.#db
        .prepare("UPDATE fragments SET deleted_at = ? WHERE id = ?")
        .run(now, id);
      const ownerId = options.ownerId ?? "local";
      for (const edge of this.listEdges({
        ownerId,
        node: { type: "fragment", id },
        includeDeleted: false,
      })) {
        this.putEdge({ ...edge, deleted_at: now });
      }
      this.appendEvent(
        "fragment.deleted",
        id,
        { orphaned_ideas: orphanedIdeas, policy: "mark" },
        now,
      );
      this.#db.exec("COMMIT");
    } catch (error) {
      this.#db.exec("ROLLBACK");
      throw error;
    }

    return { deleted: true, orphanedIdeas };
  }

  // --- outcomes and calibration -------------------------------------------

  putOutcome(outcome: Outcome): void {
    assertValid("outcome", outcome);
    this.#db
      .prepare(
        `INSERT INTO outcomes
           (id, owner_id, idea_id, decision, realised_success, predicted_confidence, decided_at, created_at, data)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           owner_id = excluded.owner_id,
           idea_id = excluded.idea_id,
           decision = excluded.decision,
           realised_success = excluded.realised_success,
           predicted_confidence = excluded.predicted_confidence,
           decided_at = excluded.decided_at,
           created_at = excluded.created_at,
           data = excluded.data`,
      )
      .run(
        outcome.id,
        outcome.owner_id,
        outcome.idea_id,
        outcome.decision,
        outcome.realised_success ? 1 : 0,
        outcome.predicted_confidence,
        outcome.decided_at,
        outcome.created_at,
        JSON.stringify(outcome),
      );
  }

  getOutcome(id: string): Outcome | null {
    const row = this.#db
      .prepare("SELECT data FROM outcomes WHERE id = ?")
      .get(id) as Row | undefined;
    return parse<Outcome>(row);
  }

  listOutcomes(options: ListOutcomeOptions = {}): Outcome[] {
    const clauses: string[] = [];
    const params: string[] = [];
    if (options.ownerId !== undefined) {
      clauses.push("owner_id = ?");
      params.push(options.ownerId);
    }
    if (options.ideaId !== undefined) {
      clauses.push("idea_id = ?");
      params.push(options.ideaId);
    }
    const where = clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "";
    const rows = this.#db
      .prepare(`SELECT data FROM outcomes${where} ORDER BY id`)
      .all(...params) as Row[];
    return rows.map((row) => JSON.parse(row.data) as Outcome);
  }

  calibrationReport(
    options: { ownerId?: string; now?: string } = {},
  ): CalibrationReport {
    const outcomes = this.listOutcomes({ ownerId: options.ownerId });
    const decidedIdeaIds = this.listIdeas()
      .filter((idea) =>
        idea.status === "briefed" ||
        idea.status === "learned" ||
        idea.status === "killed",
      )
      .map((idea) => idea.id);
    return buildCalibrationReport(outcomes, {
      now: options.now,
      decidedIdeaIds,
    });
  }

  // --- incubation jobs and suggestions -------------------------------------

  createJob(input: {
    ownerId?: string;
    kind?: JobKind;
    budget: number;
    now?: string;
  }): Job {
    const ownerId = input.ownerId ?? "local";
    if (
      !Number.isFinite(input.budget) ||
      input.budget < 0 ||
      input.budget > MAX_JOB_BUDGET
    ) {
      throw new JobError(
        "INVALID_BUDGET",
        `budget must be between 0 and ${MAX_JOB_BUDGET}.`,
      );
    }
    const open = this.#db
      .prepare(
        "SELECT COUNT(*) AS n FROM jobs WHERE owner_id = ? AND status IN ('queued','running')",
      )
      .get(ownerId) as { n: number } | undefined;
    if ((open?.n ?? 0) >= MAX_OPEN_JOBS) {
      throw new JobError(
        "JOB_CAP_REACHED",
        `at most ${MAX_OPEN_JOBS} open incubation jobs per owner.`,
      );
    }
    const now = input.now ?? new Date().toISOString();
    const job: Job = {
      id: newId("job"),
      owner_id: ownerId,
      kind: input.kind ?? "incubate",
      status: "queued",
      budget: input.budget,
      spent: 0,
      created_at: now,
      updated_at: now,
      error: null,
    };
    this.putJob(job);
    return job;
  }

  putJob(job: Job): void {
    this.#db
      .prepare(
        `INSERT INTO jobs
           (id, owner_id, kind, status, budget, spent, created_at, updated_at, data)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           owner_id = excluded.owner_id,
           kind = excluded.kind,
           status = excluded.status,
           budget = excluded.budget,
           spent = excluded.spent,
           created_at = excluded.created_at,
           updated_at = excluded.updated_at,
           data = excluded.data`,
      )
      .run(
        job.id,
        job.owner_id,
        job.kind,
        job.status,
        job.budget,
        job.spent,
        job.created_at,
        job.updated_at,
        JSON.stringify(job),
      );
  }

  getJob(id: string): Job | null {
    const row = this.#db
      .prepare("SELECT data FROM jobs WHERE id = ?")
      .get(id) as Row | undefined;
    return parse<Job>(row);
  }

  listJobs(options: ListJobOptions = {}): Job[] {
    const clauses: string[] = [];
    const params: string[] = [];
    if (options.ownerId !== undefined) {
      clauses.push("owner_id = ?");
      params.push(options.ownerId);
    }
    if (options.status !== undefined) {
      clauses.push("status = ?");
      params.push(options.status);
    }
    const where = clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "";
    const rows = this.#db
      .prepare(`SELECT data FROM jobs${where} ORDER BY created_at, id`)
      .all(...params) as Row[];
    return rows.map((row) => JSON.parse(row.data) as Job);
  }

  putSuggestion(suggestion: Suggestion): void {
    assertValid("suggestion", suggestion);
    this.#db
      .prepare(
        `INSERT INTO suggestions
           (id, owner_id, job_id, kind, status, score, created_at, data)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           owner_id = excluded.owner_id,
           job_id = excluded.job_id,
           kind = excluded.kind,
           status = excluded.status,
           score = excluded.score,
           created_at = excluded.created_at,
           data = excluded.data`,
      )
      .run(
        suggestion.id,
        suggestion.owner_id,
        suggestion.job_id,
        suggestion.kind,
        suggestion.status,
        suggestion.score,
        suggestion.created_at,
        JSON.stringify(suggestion),
      );
  }

  getSuggestion(id: string): Suggestion | null {
    const row = this.#db
      .prepare("SELECT data FROM suggestions WHERE id = ?")
      .get(id) as Row | undefined;
    return parse<Suggestion>(row);
  }

  listSuggestions(options: ListSuggestionOptions = {}): Suggestion[] {
    const clauses: string[] = [];
    const params: string[] = [];
    if (options.ownerId !== undefined) {
      clauses.push("owner_id = ?");
      params.push(options.ownerId);
    }
    if (options.status !== undefined) {
      clauses.push("status = ?");
      params.push(options.status);
    }
    if (options.jobId !== undefined) {
      clauses.push("job_id = ?");
      params.push(options.jobId);
    }
    const where = clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "";
    const rows = this.#db
      .prepare(`SELECT data FROM suggestions${where} ORDER BY created_at, id`)
      .all(...params) as Row[];
    return rows.map((row) => JSON.parse(row.data) as Suggestion);
  }

  decideSuggestion(
    id: string,
    status: Exclude<SuggestionStatus, "proposed">,
    options: { now?: string } = {},
  ): Suggestion {
    const current = this.getSuggestion(id);
    if (!current) {
      throw new JobError("SUGGESTION_NOT_FOUND", `suggestion not found: ${id}`);
    }
    const updated = applySuggestionDecision(current, status, options.now);
    this.putSuggestion(updated);
    this.appendEvent(
      "suggestion.decided",
      updated.id,
      {
        suggestion_id: updated.id,
        job_id: updated.job_id,
        status: updated.status,
        decided_by: "human",
      },
      updated.decided_at ?? undefined,
    );
    return updated;
  }

  suggestionDigest(
    options: { ownerId?: string; since?: string | null; now?: string } = {},
  ): Digest {
    return buildDigestView(this.listSuggestions({ ownerId: options.ownerId }), {
      since: options.since,
      now: options.now,
    });
  }

  // --- source snapshots and retrieval -------------------------------------

  putSnapshot(snapshot: ContentSnapshot): void {
    assertValid("snapshot", snapshot);
    this.#db
      .prepare(
        `INSERT INTO snapshots (hash, url, title, fetched_at, content, data)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(hash) DO NOTHING`,
      )
      .run(
        snapshot.hash,
        snapshot.url,
        snapshot.title ?? null,
        snapshot.fetched_at,
        snapshot.content,
        JSON.stringify(snapshot),
      );
  }

  hasSnapshot(hash: string): boolean {
    const row = this.#db
      .prepare("SELECT 1 AS present FROM snapshots WHERE hash = ?")
      .get(hash) as { present: number } | undefined;
    return row !== undefined;
  }

  getSnapshot(hash: string): ContentSnapshot | null {
    const row = this.#db
      .prepare("SELECT data FROM snapshots WHERE hash = ?")
      .get(hash) as Row | undefined;
    return parse<ContentSnapshot>(row);
  }

  listSnapshots(): ContentSnapshot[] {
    const rows = this.#db
      .prepare("SELECT data FROM snapshots ORDER BY hash")
      .all() as Row[];
    return rows.map((row) => JSON.parse(row.data) as ContentSnapshot);
  }

  putRetrievalDocument(document: StoredRetrievalDocument): void {
    this.#db
      .prepare(
        `INSERT INTO retrieval_documents
           (id, snapshot_hash, title, url, text, metadata, data)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           snapshot_hash = excluded.snapshot_hash,
           title = excluded.title,
           url = excluded.url,
           text = excluded.text,
           metadata = excluded.metadata,
           data = excluded.data`,
      )
      .run(
        document.id,
        document.snapshot_hash ?? null,
        document.title,
        document.url,
        document.text,
        JSON.stringify(document.metadata),
        JSON.stringify(document),
      );
  }

  getRetrievalDocument(id: string): StoredRetrievalDocument | null {
    const row = this.#db
      .prepare("SELECT data FROM retrieval_documents WHERE id = ?")
      .get(id) as Row | undefined;
    return parse<StoredRetrievalDocument>(row);
  }

  listRetrievalDocuments(): StoredRetrievalDocument[] {
    const rows = this.#db
      .prepare("SELECT data FROM retrieval_documents ORDER BY id")
      .all() as Row[];
    return rows.map((row) => JSON.parse(row.data) as StoredRetrievalDocument);
  }

  ingestDocuments(documents: readonly IngestDocumentInput[]): IngestResult {
    if (documents.length === 0) {
      throw new EvidenceError("EMPTY_CORPUS", "the corpus is empty");
    }
    const seen = new Set<string>();
    let snapshotsAdded = 0;
    let snapshotsCached = 0;
    for (const document of documents) {
      if (
        document.id.trim() === "" ||
        document.title.trim() === "" ||
        document.url.trim() === "" ||
        document.text.trim() === ""
      ) {
        throw new EvidenceError(
          "INVALID_DOCUMENT",
          "a document needs a non-empty id, title, url and text",
        );
      }
      if (seen.has(document.id)) {
        throw new EvidenceError(
          "DUPLICATE_DOCUMENT",
          `duplicate document id ${document.id}`,
        );
      }
      seen.add(document.id);
      const snapshot = createSnapshot({
        content: document.text,
        url: document.url,
        title: document.title,
        fetched_at: document.fetched_at,
      });
      if (this.hasSnapshot(snapshot.hash)) {
        snapshotsCached += 1;
      } else {
        this.putSnapshot(snapshot);
        snapshotsAdded += 1;
      }
      this.putRetrievalDocument({
        id: document.id,
        title: document.title,
        url: document.url,
        text: document.text,
        metadata: document.metadata ?? {},
        snapshot_hash: snapshot.hash,
      });
    }
    return {
      documents: documents.length,
      snapshots_added: snapshotsAdded,
      snapshots_cached: snapshotsCached,
    };
  }

  // --- events --------------------------------------------------------------

  appendEvent(
    type: string,
    subject: string,
    data: unknown = {},
    at = new Date().toISOString(),
  ): string {
    const id = newId("evt");
    this.#db
      .prepare("INSERT INTO events (id, at, type, subject, data) VALUES (?, ?, ?, ?, ?)")
      .run(id, at, type, subject, JSON.stringify(data));
    return id;
  }

  listEvents(subject?: string): Array<{
    id: string;
    at: string;
    type: string;
    subject: string;
    data: unknown;
  }> {
    const rows = (subject
      ? this.#db
          .prepare("SELECT id, at, type, subject, data FROM events WHERE subject = ? ORDER BY at, rowid")
          .all(subject)
      : this.#db
          .prepare("SELECT id, at, type, subject, data FROM events ORDER BY at, rowid")
          .all()) as Array<{
      id: string;
      at: string;
      type: string;
      subject: string;
      data: string;
    }>;
    return rows.map((r) => ({ ...r, data: JSON.parse(r.data) as unknown }));
  }

  counts(): {
    fragments: number;
    ideas: number;
    claims: number;
    gates: number;
    briefs: number;
    constraints: number;
    snapshots: number;
    documents: number;
  } {
    const one = (sql: string): number => {
      const row = this.#db.prepare(sql).get() as { n: number } | undefined;
      return row?.n ?? 0;
    };
    return {
      fragments: one("SELECT COUNT(*) AS n FROM fragments"),
      ideas: one("SELECT COUNT(*) AS n FROM ideas"),
      claims: one("SELECT COUNT(*) AS n FROM claims"),
      gates: one("SELECT COUNT(*) AS n FROM gates"),
      briefs: one("SELECT COUNT(*) AS n FROM briefs"),
      constraints: one("SELECT COUNT(*) AS n FROM constraint_states"),
      snapshots: one("SELECT COUNT(*) AS n FROM snapshots"),
      documents: one("SELECT COUNT(*) AS n FROM retrieval_documents"),
    };
  }
}
