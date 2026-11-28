export type NoveltyNodeKind =
  | "project"
  | "part"
  | "mechanism"
  | "host"
  | "readout"
  | "substrate"
  | "evidence"
  | "idea";

export type NoveltyEdgeKind =
  | "uses"
  | "improves"
  | "collides_with"
  | "requires";

export interface NoveltyNode {
  id: string;
  kind: NoveltyNodeKind;
  label: string;
  properties?: Record<string, unknown>;
}

export interface NoveltyEdge {
  from: string;
  to: string;
  kind: NoveltyEdgeKind;
  note?: string;
}

export interface CandidateMechanism {
  id?: string;
  mechanism: string;
  interface: string;
  host: string;
  readout: string;
  substrate?: string;
  sequence_hash?: string;
}

export type CollisionKind = "mechanism" | "interface" | "sequence";
export type CollisionSeverity = "high" | "medium";

export interface CollisionHit {
  kind: CollisionKind;
  prior_id: string;
  prior_label: string;
  severity: CollisionSeverity;
  note: string;
  matched: string[];
}

export type CollisionVerdict = "novel" | "interface" | "blocked";

export interface CollisionReport {
  candidate: CandidateMechanism;
  hits: CollisionHit[];
  mechanism_collisions: number;
  interface_whitespace: number;
  sequence_collisions: number;
  verdict: CollisionVerdict;
  novelty_argument: string;
}
