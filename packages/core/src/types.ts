import type * as GeneratedSchemas from "./generated/schemas.js";

export type Privacy = "private" | "team" | "public";
export type FragmentKind = "text" | "voice" | "image" | "link" | "sketch";

export type Fragment = GeneratedSchemas.Fragment;

export type ConfidenceBasis = "A" | "B" | "C" | "expert";
export type ClaimStatus =
  | "verified"
  | "inferred"
  | "unsupported"
  | "unknown"
  | "contradicted";
export type SourceKind =
  | "paper"
  | "registry"
  | "wiki"
  | "dataset"
  | "web"
  | "expert"
  | "experiment";

export interface Source {
  kind: SourceKind;
  url: string;
  title?: string | null;
  span?: string | null;
  snapshot_hash?: string | null;
  accessed_at: string;
}

export type Claim = GeneratedSchemas.Claim;

export type IdeaStatus =
  | "fragment"
  | "developed"
  | "incubating"
  | "verifying"
  | "viable"
  | "parked"
  | "killed"
  | "briefed"
  | "learned";

export type HypothesisVariant = "conservative" | "ambitious" | "cross_domain";
export type AssumptionStatus = "unconfirmed" | "confirmed" | "refuted";
export type RiskLevel = "low" | "medium" | "high";

export interface Hypothesis {
  id: string;
  variant: HypothesisVariant;
  statement: string;
  confidence: number;
  confidence_basis: ConfidenceBasis;
  assumption_ids?: string[];
  claim_ids?: string[];
}

export interface Assumption {
  id: string;
  statement: string;
  status: AssumptionStatus;
  risk: RiskLevel;
  evidence_ref?: string | null;
  decided_by?: string | null;
}

export interface OpenQuestion {
  id: string;
  question: string;
  expected_information_gain: number;
  variable?: string | null;
  answered?: boolean;
}

export interface Idea {
  id: string;
  version: number;
  fragment_ids?: string[];
  vertical?: string;
  title: string;
  one_liner: string;
  status: IdeaStatus;
  hypotheses: Hypothesis[];
  assumptions: Assumption[];
  claims: string[];
  open_questions?: OpenQuestion[];
  gate_ids?: string[];
  brief_ref?: string | null;
  created_at?: string;
  updated_at?: string;
  schema_version?: "1.0.0";
}

export type GateStatus = "pass" | "fail" | "unknown" | "waived";
export type GateFallback =
  | "change_readout"
  | "change_host"
  | "reduce_scope"
  | "compute_only"
  | "none";
export type GateDecider = "rule" | "model" | "human";

export interface Gate {
  id: string;
  idea_id?: string;
  name: string;
  status: GateStatus;
  criteria: string;
  falsifier: string;
  controls?: string[];
  evidence?: string[];
  fallback: GateFallback;
  hard?: boolean;
  decided_by: GateDecider;
  reason?: string | null;
  decided_at?: string | null;
  schema_version?: "1.0.0";
}

export type BriefValidatorName =
  | "citation"
  | "numeric"
  | "existence"
  | "vertical_rules";

export interface BriefValidator {
  name: BriefValidatorName;
  status: "pass" | "fail" | "skipped";
  detail?: string | null;
}

export interface BriefRisk {
  risk: string;
  trigger: string;
  fallback: GateFallback;
}

export interface BriefSection {
  text: string;
  claim_ids?: string[];
}

export interface BriefCollision {
  kind: "mechanism" | "interface" | "sequence";
  prior_id: string;
  prior_label: string;
  severity: "high" | "medium";
  note: string;
  /** Claims that depend on the colliding element; optional evidence link. */
  claim_ids?: string[];
  /** The prior-art source for this collision, when one is known. */
  source_url?: string | null;
}

export interface BriefCollisionCheck {
  status: "checked" | "not_checked";
  note: string;
}

export interface BriefExtraSection {
  title: string;
  text: string;
}

export interface Brief {
  id: string;
  idea_id: string;
  idea_version: number;
  format?: "markdown" | "json" | "html";
  one_liner: string;
  problem: BriefSection;
  approach: BriefSection;
  evidence: string[];
  risks: BriefRisk[];
  collisions?: BriefCollision[];
  collision_check?: BriefCollisionCheck;
  sections?: BriefExtraSection[];
  next_steps: string[];
  unknowns: string[];
  compiled_at?: string;
  validators: BriefValidator[];
  schema_version?: "1.0.0";
}

export type MemoryNodeType = "fragment" | "idea" | "claim" | "gate" | "outcome";

export type MemoryRelation =
  | "derived_from"
  | "references"
  | "supports"
  | "contradicts"
  | "supersedes"
  | "duplicates"
  | "collided_with"
  | "outcome_of";

export interface MemoryNodeRef {
  type: MemoryNodeType;
  id: string;
}

export type MemoryEdge = GeneratedSchemas.MemoryEdge;
