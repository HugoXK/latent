import { DatabaseSync } from "node:sqlite";
import { newId } from "@latent/core";
import type {
  Brief,
  Claim,
  Fragment,
  Gate,
  Idea,
  IdeaStatus,
} from "@latent/core";

const SCHEMA = `
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

type Row = { data: string };

function parse<T>(row: Row | undefined): T | null {
  return row ? (JSON.parse(row.data) as T) : null;
}

export class Store {
  readonly #db: DatabaseSync;

  constructor(path = ":memory:") {
    this.#db = new DatabaseSync(path);
    this.#db.exec(SCHEMA);
  }

  close(): void {
    this.#db.close();
  }

  // --- fragments -----------------------------------------------------------

  putFragment(fragment: Fragment): void {
    this.#db
      .prepare(
        `INSERT INTO fragments (id, captured_at, data) VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET data = excluded.data`,
      )
      .run(fragment.id, fragment.captured_at, JSON.stringify(fragment));
  }

  getFragment(id: string): Fragment | null {
    const row = this.#db
      .prepare("SELECT data FROM fragments WHERE id = ?")
      .get(id) as Row | undefined;
    return parse<Fragment>(row);
  }

  // --- ideas ---------------------------------------------------------------

  putIdea(idea: Idea): void {
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

  // --- events --------------------------------------------------------------

  appendEvent(type: string, subject: string, data: unknown = {}): string {
    const id = newId("evt");
    this.#db
      .prepare("INSERT INTO events (id, at, type, subject, data) VALUES (?, ?, ?, ?, ?)")
      .run(id, new Date().toISOString(), type, subject, JSON.stringify(data));
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
          .prepare("SELECT id, at, type, subject, data FROM events WHERE subject = ? ORDER BY at")
          .all(subject)
      : this.#db
          .prepare("SELECT id, at, type, subject, data FROM events ORDER BY at")
          .all()) as Array<{
      id: string;
      at: string;
      type: string;
      subject: string;
      data: string;
    }>;
    return rows.map((r) => ({ ...r, data: JSON.parse(r.data) as unknown }));
  }

  counts(): { fragments: number; ideas: number; claims: number; gates: number; briefs: number } {
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
    };
  }
}
