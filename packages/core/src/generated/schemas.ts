// Generated from data/schemas by scripts/generate-schema-types.ts.
// Do not edit by hand. Run `pnpm schema:types`.

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
  sections?: BriefExtraSection[];
  next_steps: string[];
  unknowns: string[];
  compiled_at?: string;
  validators: BriefValidator[];
  schema_version?: "1.0.0";
  collision_check?: {
  status: "checked" | "not_checked";
  note: string;
};
}
export interface BriefCollision {
  kind: "mechanism" | "interface" | "sequence";
  prior_id: string;
  prior_label: string;
  severity: "high" | "medium";
  note: string;
  claim_ids?: string[];
  source_url?: string | null;
}
export interface BriefExtraSection {
  title: string;
  text: string;
}
export interface BriefRisk {
  risk: string;
  trigger: string;
  fallback: "change_readout" | "change_host" | "reduce_scope" | "compute_only" | "none";
}
export interface BriefSection {
  text: string;
  claim_ids?: string[];
}
export interface BriefValidator {
  name: "citation" | "numeric" | "existence" | "vertical_rules";
  status: "pass" | "fail" | "skipped";
  detail?: string | null;
}

export interface Claim {
  id: string;
  text: string;
  value?: number | string | null;
  unit?: string | null;
  conditions?: Record<string, unknown> | null;
  status: "verified" | "inferred" | "unsupported" | "unknown" | "contradicted";
  confidence: number;
  confidence_basis: "A" | "B" | "C" | "expert";
  sources: ClaimSource[];
  contradictions?: ClaimSource[];
  verified_at?: string | null;
  verifier?: string | null;
  schema_version?: "1.0.0";
}
export interface ClaimSource {
  kind: "paper" | "registry" | "wiki" | "dataset" | "web" | "expert" | "experiment";
  url: string;
  title?: string | null;
  span?: string | null;
  snapshot_hash?: string | null;
  accessed_at: string;
}

export interface ConstraintState {
  version: number;
  vertical: string;
  variables: Record<string, unknown>;
  unknowns: string[];
  blocking_unknowns?: string[];
  updated_at?: string;
  schema_version?: "1.0.0";
}
export interface ConstraintStateVariable {
  value: unknown;
  confidence: number;
  source: "user" | "inferred" | "tool" | "default";
  evidence_ref?: string | null;
  updated_at?: string;
}

export interface MemoryEdge {
  id: string;
  owner_id: string;
  from: MemoryEdgeNode;
  to: MemoryEdgeNode;
  relation: "derived_from" | "references" | "supports" | "contradicts" | "supersedes" | "duplicates" | "collided_with" | "outcome_of";
  weight?: number;
  provenance: string;
  created_at: string;
  deleted_at?: string | null;
  schema_version?: "1.0.0";
}
export interface MemoryEdgeNode {
  type: "fragment" | "idea" | "claim" | "gate" | "outcome";
  id: string;
}

export interface Fragment {
  id: string;
  captured_at: string;
  kind: "text" | "voice" | "image" | "link" | "sketch";
  content: string;
  language?: string | null;
  media?: string | null;
  source?: string | null;
  tags?: string[];
  privacy: "private" | "team" | "public";
  embedding_ref?: string | null;
  schema_version?: "1.0.0";
}

export interface Gate {
  id: string;
  idea_id?: string;
  name: string;
  status: "pass" | "fail" | "unknown" | "waived";
  criteria: string;
  falsifier: string;
  controls?: string[];
  evidence: string[];
  fallback: "change_readout" | "change_host" | "reduce_scope" | "compute_only" | "none";
  hard?: boolean;
  decided_by: "rule" | "model" | "human";
  reason?: string | null;
  decided_at?: string | null;
  schema_version?: "1.0.0";
}

export interface Idea {
  id: string;
  version: number;
  fragment_ids?: string[];
  vertical?: string;
  title: string;
  one_liner: string;
  status: "fragment" | "developed" | "incubating" | "verifying" | "viable" | "parked" | "killed" | "briefed" | "learned";
  hypotheses: IdeaHypothesis[];
  assumptions: IdeaAssumption[];
  claims: string[];
  open_questions?: IdeaQuestion[];
  gate_ids?: string[];
  brief_ref?: string | null;
  created_at?: string;
  updated_at?: string;
  schema_version?: "1.0.0";
}
export interface IdeaAssumption {
  id: string;
  statement: string;
  status: "unconfirmed" | "confirmed" | "refuted";
  risk: "low" | "medium" | "high";
  evidence_ref?: string | null;
  decided_by?: string | null;
}
export interface IdeaHypothesis {
  id: string;
  variant: "conservative" | "ambitious" | "cross_domain";
  statement: string;
  confidence: number;
  confidence_basis: "A" | "B" | "C" | "expert";
  assumption_ids?: string[];
  claim_ids?: string[];
}
export interface IdeaQuestion {
  id: string;
  question: string;
  expected_information_gain: number;
  variable?: string | null;
  answered?: boolean;
}

export interface Outcome {
  id: string;
  idea_id: string;
  idea_version: number;
  owner_id: string;
  decision: "shipped" | "tested" | "parked" | "killed" | "failed";
  realised_success: boolean;
  predicted_confidence: number;
  predicted_at?: string | null;
  decided_at: string;
  decided_by: "human" | "expert";
  evidence?: string[];
  notes?: string | null;
  created_at: string;
  schema_version?: "1.0.0";
}

export interface ReplayCase {
  metadata: ReplayCaseMetadata;
  constraints: ConstraintState;
  fragment: Fragment;
  prior_art: ReplayCasePriorArt[];
  expected_candidates: ReplayCaseCandidate[];
  collisions: ReplayCaseCollision[];
  gate_labels: ReplayCaseGateLabel[];
  outcome: ReplayCaseOutcome;
}
export interface ReplayCaseCandidate {
  id: string;
  statement: string;
  variant: "conservative" | "ambitious" | "cross_domain";
  mechanism: string;
  interface: string;
  host: string;
  readout: string;
  is_seed: boolean;
}
export interface ReplayCaseCollision {
  id: string;
  kind: "mechanism" | "interface" | "sequence";
  prior_art_id: string;
  note: string;
}
export interface ReplayCaseGateLabel {
  gate: string;
  expected: "pass" | "fail" | "unknown";
  rationale: string;
  source?: string | null;
}
export interface ReplayCaseMetadata {
  id: string;
  title: string;
  vertical: string;
  season: number;
  village: string;
  illustrative: boolean;
  temporal_cutoff: string;
  created_at: string;
  owner: string;
  license?: string | null;
}
export interface ReplayCaseOutcome {
  hidden: true;
  seed_title: string;
  seed_doi?: string | null;
  decision: "shipped" | "tested" | "parked" | "killed" | "failed";
  evidence: string[];
  notes?: string | null;
}
export interface ReplayCasePriorArt {
  id: string;
  title: string;
  kind: "project" | "part" | "paper";
  year: number;
  url: string;
  published_at: string;
  mechanism: string;
  interface: string;
  source_grade: "A" | "B" | "C";
}

export interface SourceSnapshot {
  hash: string;
  url: string;
  title?: string | null;
  fetched_at: string;
  content: string;
  content_type?: string | null;
  schema_version?: "1.0.0";
}

export interface Suggestion {
  id: string;
  owner_id: string;
  job_id: string;
  kind: "connection" | "resurface" | "contradiction" | "duplicate";
  from: SuggestionNode;
  to: SuggestionNode;
  reason: string;
  score: number;
  budget_cost: number;
  status: "proposed" | "accepted" | "rejected" | "revoked";
  created_at: string;
  decided_at?: string | null;
  decided_by?: string | null;
  schema_version?: "1.0.0";
}
export interface SuggestionNode {
  type: "fragment" | "idea" | "claim" | "gate" | "outcome";
  id: string;
}
