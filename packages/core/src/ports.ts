import type { ConstraintState } from "./constraints.js";
import type {
  ClaimStatus,
  ConfidenceBasis,
  Fragment,
  HypothesisVariant,
  RiskLevel,
} from "./types.js";

export interface ReconstructInput {
  fragment: Fragment;
  verticalId: string;
  constraints?: ConstraintState;
  now?: string;
}

export interface ReconstructHypothesis {
  variant: HypothesisVariant;
  statement: string;
  confidence: number;
  confidence_basis: ConfidenceBasis;
  assumption_ids?: string[];
}

export interface ReconstructAssumption {
  statement: string;
  risk: RiskLevel;
}

export interface ReconstructClaim {
  text: string;
  status: ClaimStatus;
  confidence: number;
  confidence_basis: ConfidenceBasis;
}

export interface ReconstructQuestion {
  question: string;
  expected_information_gain: number;
  variable?: string;
}

export interface ReconstructOutput {
  title: string;
  one_liner: string;
  hypotheses: ReconstructHypothesis[];
  assumptions: ReconstructAssumption[];
  claims: ReconstructClaim[];
  open_questions: ReconstructQuestion[];
}

export interface Reconstructor {
  reconstruct(input: ReconstructInput): Promise<ReconstructOutput>;
}

export interface ModelProvider {
  complete(input: { prompt: string; system?: string }): Promise<{ text: string }>;
  embed(input: string[]): Promise<number[][]>;
}

export interface SearchHit {
  id: string;
  title: string;
  url: string;
  snippet: string;
}

export interface SearchProvider {
  search(query: string, limit?: number): Promise<SearchHit[]>;
}

export interface AgentRuntime {
  schedule(job: { id: string; kind: string; payload: unknown }): Promise<{ ref: string }>;
  cancel(ref: string): Promise<void>;
}

export interface Calibrator {
  record(prediction: { id: string; confidence: number }, outcome: { id: string; value: boolean }): Promise<void>;
}
