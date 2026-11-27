import type { QuestionDefinition } from "./constraints.js";
import type { GateFallback } from "./types.js";

export interface GateDefinition {
  key: string;
  name: string;
  criteria: string;
  falsifier: string;
  fallback: GateFallback;
  hard: boolean;
}

export interface VerticalRules {
  version: string;
  checked_at: string;
}

export interface VerticalPack {
  id: string;
  name: string;
  description?: string;
  evidenceScale?: string[];
  rules?: VerticalRules;
  /** Run the biosafety classifier before reconstruction. */
  biosafety?: boolean;
  variables: string[];
  questions: QuestionDefinition[];
  gates: GateDefinition[];
  briefTemplate: string;
}
