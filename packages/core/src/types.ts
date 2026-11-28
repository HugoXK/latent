import type * as GeneratedSchemas from "./generated/schemas.js";

// Derived from the generated schema types: a schema enum change widens these
// unions too, so code that types a value with them cannot silently disagree.
export type Privacy = GeneratedSchemas.Fragment["privacy"];
export type FragmentKind = GeneratedSchemas.Fragment["kind"];

export type Fragment = GeneratedSchemas.Fragment;

export type ConfidenceBasis = GeneratedSchemas.Claim["confidence_basis"];
export type ClaimStatus = GeneratedSchemas.Claim["status"];
export type SourceKind = GeneratedSchemas.ClaimSource["kind"];

export type Source = GeneratedSchemas.ClaimSource;

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

export type MemoryRelation = GeneratedSchemas.MemoryEdge["relation"];

export interface MemoryNodeRef {
  type: MemoryNodeType;
  id: string;
}

export type MemoryEdge = GeneratedSchemas.MemoryEdge;
