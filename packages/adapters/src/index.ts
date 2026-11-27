import type {
  AgentRuntime,
  Calibrator,
  ModelProvider,
  ReconstructInput,
  ReconstructOutput,
  Reconstructor,
  SearchHit,
  SearchProvider,
} from "@latent/core";
import { FixtureExistenceProvider } from "@latent/core";
import type { ExistenceProvider } from "@latent/core";
import {
  ModelReconstructor,
  createReplayFetch,
} from "./model-reconstructor.js";

export * from "./model-reconstructor.js";

/**
 * A deterministic, offline reconstructor for the v0.2 vertical slice.
 * It is not a model and does not claim to be one. It exists so the pipeline
 * (capture → develop → gate → brief) can be tested and demonstrated without a
 * provider. A real model adapter replaces it behind the same port.
 */
export class TemplateReconstructor implements Reconstructor {
  async reconstruct(input: ReconstructInput): Promise<ReconstructOutput> {
    const text = input.fragment.content.trim();
    const short = text.length > 80 ? `${text.slice(0, 77)}...` : text;

    const bsl = input.constraints?.variables["lab.bsl"]?.value;
    const bslKnown = bsl === 1 || bsl === 2;
    const weeks = input.constraints?.variables["time.summer_weeks"]?.value;
    const dbtlRisk = typeof weeks === "number" && weeks >= 6 ? "medium" : "high";
    const metric = input.constraints?.variables["success.metric"]?.value;
    const metricText =
      typeof metric === "string" ? ` The success metric is ${metric}.` : "";

    return {
      title: short.length > 0 ? short : "(untitled fragment)",
      one_liner: text.length > 0 ? text : "(empty fragment)",
      hypotheses: [
        {
          variant: "conservative",
          statement: `Conservative reading: ${text} — keep the mechanism and choose the cheapest readout that has been characterised before.${metricText}`,
          confidence: bslKnown ? 0.48 : 0.42,
          confidence_basis: "C",
        },
        {
          variant: "ambitious",
          statement: `Ambitious reading: ${text} — change the host and the readout so the novelty lives in the interface, not the mechanism.`,
          confidence: 0.28,
          confidence_basis: "C",
        },
        {
          variant: "cross_domain",
          statement: `Cross-domain reading: ${text} — borrow a measurement approach from another field and adapt it to this host.`,
          confidence: 0.22,
          confidence_basis: "C",
        },
      ],
      assumptions: [
        {
          statement: "The readout can be made quantitative with a dose response.",
          risk: "high",
        },
        {
          statement: "The host and lab operations are within the team's BSL clearance.",
          risk: bslKnown ? "low" : "high",
        },
        {
          statement: "One DBTL loop can close within the season.",
          risk: dbtlRisk,
        },
      ],
      claims: [
        {
          text: "The readout, host and sample matrix are not yet confirmed.",
          status: "unknown",
          confidence: 0.2,
          confidence_basis: "C",
        },
      ],
      open_questions: [
        {
          question: "What is the one measurable number that decides success?",
          expected_information_gain: 0.72,
          variable: "success.metric",
        },
        {
          question: "Does the team have the host, the equipment and the BSL level this needs?",
          expected_information_gain: 0.61,
          variable: "lab.bsl",
        },
        {
          question: "Who has the problem today, and what do they pay for the workaround?",
          expected_information_gain: 0.55,
          variable: "problem.who",
        },
      ],
    };
  }
}

export class FakeModelProvider implements ModelProvider {
  constructor(private readonly reply = "fake completion") {}

  async complete(_input: { prompt: string; system?: string }): Promise<{ text: string }> {
    return { text: this.reply };
  }

  async embed(input: string[]): Promise<number[][]> {
    return input.map(() => [0, 0, 0]);
  }
}

export class FakeSearchProvider implements SearchProvider {
  constructor(private readonly hits: SearchHit[] = []) {}

  async search(query: string, limit = 10): Promise<SearchHit[]> {
    return this.hits
      .filter((h) => h.title.includes(query) || h.snippet.includes(query))
      .slice(0, limit);
  }
}

export class NoopAgentRuntime implements AgentRuntime {
  async schedule(_job: { id: string; kind: string; payload: unknown }): Promise<{ ref: string }> {
    return { ref: "noop" };
  }

  async cancel(): Promise<void> {
    return;
  }
}

export class InMemoryCalibrator implements Calibrator {
  readonly rows: Array<{ prediction: { id: string; confidence: number }; outcome: { id: string; value: boolean } }> = [];

  async record(
    prediction: { id: string; confidence: number },
    outcome: { id: string; value: boolean },
  ): Promise<void> {
    this.rows.push({ prediction, outcome });
  }
}

export function reconstructorFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): Reconstructor {
  const mode = env.LATENT_RECONSTRUCTOR ?? "template";
  if (mode === "template") return new TemplateReconstructor();
  if (mode === "model" && env.LATENT_MODEL_REPLAY === "1") {
    const temperature = Number(env.LATENT_MODEL_TEMPERATURE ?? "0");
    return new ModelReconstructor({
      baseUrl: env.LATENT_MODEL_BASE_URL ?? "http://replay.invalid",
      apiKey: env.LATENT_MODEL_API_KEY ?? "replay",
      model: env.LATENT_MODEL_NAME ?? "replay-model",
      jsonMode: env.LATENT_MODEL_JSON_MODE !== "false",
      temperature: Number.isFinite(temperature) ? temperature : 0,
      // Replay never leaves the machine, so a private fragment is safe here.
      allowPrivate: true,
      fetchImpl: createReplayFetch({
        dir: env.LATENT_MODEL_REPLAY_DIR ?? "data/model-replay",
      }),
    });
  }
  if (mode === "model") {
    const baseUrl = env.LATENT_MODEL_BASE_URL;
    const apiKey = env.LATENT_MODEL_API_KEY;
    const model = env.LATENT_MODEL_NAME;
    if (!baseUrl || !apiKey || !model) {
      throw new Error(
        "LATENT_RECONSTRUCTOR=model needs LATENT_MODEL_BASE_URL, LATENT_MODEL_API_KEY and LATENT_MODEL_NAME",
      );
    }
    const temperature = Number(env.LATENT_MODEL_TEMPERATURE ?? "0");
    return new ModelReconstructor({
      baseUrl,
      apiKey,
      model,
      jsonMode: env.LATENT_MODEL_JSON_MODE !== "false",
      temperature: Number.isFinite(temperature) ? temperature : 0,
      allowPrivate: env.LATENT_MODEL_SEND_PRIVATE === "true",
    });
  }
  throw new Error(`unknown LATENT_RECONSTRUCTOR: ${mode}`);
}

export function existenceProviderFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): ExistenceProvider | null {
  const raw = env.LATENT_EXISTENCE_JSON;
  if (!raw) return null;
  try {
    const options = JSON.parse(raw) as {
      exists?: Record<string, string[]>;
      missing?: Record<string, string[]>;
      offline?: boolean;
    };
    return new FixtureExistenceProvider(options);
  } catch {
    return null;
  }
}
