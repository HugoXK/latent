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

export interface VerticalPack {
  id: string;
  name: string;
  variables: string[];
  questions: QuestionDefinition[];
  gates: GateDefinition[];
  briefTemplate: string;
}
