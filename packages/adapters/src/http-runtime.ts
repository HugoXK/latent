import { createHmac, timingSafeEqual } from "node:crypto";
import type { AgentRuntime } from "@latent/core";

export interface RuntimeResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
  json(): Promise<unknown>;
}

export type RuntimeFetch = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body?: string;
    signal: AbortSignal;
  },
) => Promise<RuntimeResponse>;

export interface HttpAgentRuntimeOptions {
  baseUrl: string;
  /** A runtime-scoped token; never a user's model/provider key. */
  token: string;
  fetchImpl?: RuntimeFetch;
  timeoutMs?: number;
  callbackUrl?: string;
  idempotencyHeader?: string;
}

export class RuntimeError extends Error {
  readonly code: string;
  readonly status?: number;

  constructor(code: string, message: string, status?: number) {
    super(message);
    this.name = "RuntimeError";
    this.code = code;
    this.status = status;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Strip trailing slashes without a backtracking regular expression. The base URL
 * is library input (CodeQL flags a `/+$` rewrite as a ReDoS), so this is a single
 * linear scan.
 */
function stripTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === 47) end -= 1;
  return value.slice(0, end);
}

/**
 * The FlyBot-compatible runtime contract:
 *
 *   POST {base}/v1/jobs            { id, kind, payload }  -> { ref } | { id }
 *   POST {base}/v1/jobs/{ref}/cancel                      -> 2xx
 *
 * The token is runtime-scoped. The adapter never receives a model key and never
 * sends a private fragment; the payload is the job descriptor (seed, budget,
 * callback URL).
 */
export class HttpAgentRuntime implements AgentRuntime {
  readonly #baseUrl: string;
  readonly #token: string;
  readonly #fetch: RuntimeFetch;
  readonly #timeoutMs: number;
  readonly #callbackUrl: string | null;
  readonly #idempotencyHeader: string;

  constructor(options: HttpAgentRuntimeOptions) {
    if (!options.baseUrl.trim()) throw new RuntimeError("RUNTIME_CONFIG", "baseUrl is required");
    if (!options.token.trim()) throw new RuntimeError("RUNTIME_CONFIG", "token is required");
    const timeoutMs = options.timeoutMs ?? 10_000;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new RuntimeError(
        "RUNTIME_CONFIG",
        "timeoutMs must be a positive finite number",
      );
    }
    this.#baseUrl = stripTrailingSlashes(options.baseUrl);
    this.#token = options.token;
    this.#fetch = options.fetchImpl ?? ((url, init) => globalThis.fetch(url, init));
    this.#timeoutMs = timeoutMs;
    this.#callbackUrl = options.callbackUrl?.trim() ? options.callbackUrl.trim() : null;
    this.#idempotencyHeader = options.idempotencyHeader ?? "Idempotency-Key";
  }

  async #request(
    method: "POST",
    path: string,
    body?: string,
    extraHeaders: Record<string, string> = {},
  ): Promise<RuntimeResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.#timeoutMs);
    try {
      const response = await this.#fetch(`${this.#baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.#token}`,
          Accept: "application/json",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...extraHeaders,
        },
        ...(body === undefined ? {} : { body }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new RuntimeError(
          "RUNTIME_HTTP_ERROR",
          `runtime returned HTTP ${response.status}`,
          response.status,
        );
      }
      return response;
    } catch (error) {
      if (error instanceof RuntimeError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      const redacted = message.split(this.#token).join("[redacted]");
      if (error instanceof Error && error.name === "AbortError") {
        throw new RuntimeError(
          "RUNTIME_TIMEOUT",
          `runtime did not answer within ${this.#timeoutMs} ms`,
        );
      }
      throw new RuntimeError("RUNTIME_UNAVAILABLE", redacted);
    } finally {
      clearTimeout(timer);
    }
  }

  async schedule(job: {
    id: string;
    kind: string;
    payload: unknown;
  }): Promise<{ ref: string }> {
    const payload = this.#callbackUrl
      ? {
          ...(isRecord(job.payload) ? job.payload : { data: job.payload }),
          callback: { url: this.#callbackUrl, job_id: job.id },
        }
      : job.payload;
    const body = JSON.stringify({ id: job.id, kind: job.kind, payload });
    const response = await this.#request("POST", "/v1/jobs", body, {
      [this.#idempotencyHeader]: job.id,
    });
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new RuntimeError("INVALID_RUNTIME_RESPONSE", "runtime returned non-JSON");
    }
    const record = isRecord(data) ? data : {};
    const ref =
      typeof record.ref === "string"
        ? record.ref
        : typeof record.id === "string"
          ? record.id
          : null;
    if (!ref) {
      throw new RuntimeError(
        "INVALID_RUNTIME_RESPONSE",
        "runtime response needs a string ref or id",
      );
    }
    return { ref };
  }

  async cancel(ref: string): Promise<void> {
    if (ref.trim() === "") {
      throw new RuntimeError("INVALID_JOB_REF", "a job ref is required");
    }
    await this.#request(
      "POST",
      `/v1/jobs/${encodeURIComponent(ref)}/cancel`,
    );
  }
}

export function deriveJobSecret(rootSecret: string, jobId: string): string {
  if (rootSecret.trim() === "") {
    throw new RuntimeError("RUNTIME_CONFIG", "a callback root secret is required");
  }
  return createHmac("sha256", rootSecret)
    .update(`latent-callback:${jobId}`)
    .digest("hex");
}

export interface CallbackInput {
  secret: string;
  jobId: string;
  timestamp: string;
  body: string;
}

export function signJobCallback(input: CallbackInput): string {
  const jobSecret = deriveJobSecret(input.secret, input.jobId);
  return createHmac("sha256", jobSecret)
    .update(`${input.jobId}.${input.timestamp}.${input.body}`)
    .digest("hex");
}

export interface VerifyCallbackInput extends CallbackInput {
  signature: string;
  toleranceSeconds?: number;
  now?: number;
}

/**
 * Verify a job-scoped callback. The signature covers the job id, timestamp and
 * raw body; a stale timestamp is rejected to prevent a replay. The job secret is
 * derived from a shared root, so a leaked signature cannot be reused for another
 * job.
 */
export function verifyJobCallback(input: VerifyCallbackInput): boolean {
  const timestamp = Date.parse(input.timestamp);
  if (!Number.isFinite(timestamp)) return false;
  const now = input.now ?? Date.now();
  const tolerance = (input.toleranceSeconds ?? 300) * 1000;
  if (Math.abs(now - timestamp) > tolerance) return false;
  const expected = signJobCallback(input);
  const left = Buffer.from(expected);
  const right = Buffer.from(input.signature);
  return left.length === right.length && timingSafeEqual(left, right);
}
