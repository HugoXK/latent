import { createHash, createHmac, timingSafeEqual } from "node:crypto";
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
    redirect?: "error";
  },
) => Promise<RuntimeResponse>;

const CALLBACK_TOLERANCE_SECONDS = 300;
const MAX_FUTURE_SKEW_MS = 5_000;
const MIN_ROOT_SECRET_LENGTH = 16;
const MAX_PAYLOAD_BYTES = 64 * 1024;
const DEFAULT_KEY_ID = "v1";
const PAYLOAD_FIELDS = new Set(["seed", "budget", "since"]);

export interface HttpAgentRuntimeOptions {
  baseUrl: string;
  /** A runtime-scoped token; never a user's model/provider key. */
  token: string;
  fetchImpl?: RuntimeFetch;
  timeoutMs?: number;
  callbackUrl?: string;
  idempotencyHeader?: string;
  /** The callback key id; rotating the root secret means a new id. */
  keyId?: string;
  /** Test-only escape hatch for `http://`; production must use https. */
  allowInsecureHttp?: boolean;
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
 * A job payload is a descriptor, not a data channel. Seed id, budget and since
 * are the only fields; anything else (notably private fragment text) is refused
 * before a request is built, and the serialized descriptor is size-capped.
 */
function validateJobPayload(payload: unknown): Record<string, unknown> {
  if (!isRecord(payload)) {
    throw new RuntimeError("INVALID_JOB_PAYLOAD", "payload must be an object");
  }
  for (const key of Object.keys(payload)) {
    if (!PAYLOAD_FIELDS.has(key)) {
      throw new RuntimeError(
        "INVALID_JOB_PAYLOAD",
        `unexpected payload field: ${key}`,
      );
    }
  }
  const serialized = JSON.stringify(payload);
  if (Buffer.byteLength(serialized, "utf8") > MAX_PAYLOAD_BYTES) {
    throw new RuntimeError(
      "INVALID_JOB_PAYLOAD",
      `payload exceeds ${MAX_PAYLOAD_BYTES} bytes`,
    );
  }
  if ("seed" in payload) {
    const seed = payload.seed;
    if (!isRecord(seed)) {
      throw new RuntimeError("INVALID_JOB_PAYLOAD", "seed must be an object");
    }
    for (const key of Object.keys(seed)) {
      if (key !== "type" && key !== "id") {
        throw new RuntimeError(
          "INVALID_JOB_PAYLOAD",
          `unexpected seed field: ${key}`,
        );
      }
    }
    if (typeof seed.type !== "string" || typeof seed.id !== "string") {
      throw new RuntimeError(
        "INVALID_JOB_PAYLOAD",
        "seed needs string type and id",
      );
    }
  }
  if ("budget" in payload) {
    if (
      typeof payload.budget !== "number" ||
      !Number.isFinite(payload.budget) ||
      payload.budget < 0
    ) {
      throw new RuntimeError(
        "INVALID_JOB_PAYLOAD",
        "budget must be a non-negative finite number",
      );
    }
  }
  if ("since" in payload) {
    if (typeof payload.since !== "string" || !Number.isFinite(Date.parse(payload.since))) {
      throw new RuntimeError("INVALID_JOB_PAYLOAD", "since must be an ISO timestamp");
    }
  }
  return payload;
}

function assertSafeRuntimeUrl(
  value: string,
  label: string,
  allowInsecureHttp: boolean,
): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new RuntimeError("RUNTIME_CONFIG", `${label} must be an absolute URL`);
  }
  if (parsed.username || parsed.password) {
    throw new RuntimeError("RUNTIME_CONFIG", `${label} must not contain userinfo`);
  }
  const loopback =
    parsed.hostname === "localhost" ||
    parsed.hostname === "127.0.0.1" ||
    parsed.hostname === "::1" ||
    parsed.hostname === "[::1]";
  if (
    parsed.protocol !== "https:" &&
    !(parsed.protocol === "http:" && (loopback || allowInsecureHttp))
  ) {
    throw new RuntimeError(
      "RUNTIME_CONFIG",
      `${label} must use https (http is allowed only for loopback or tests)`,
    );
  }
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
  readonly #keyId: string;

  constructor(options: HttpAgentRuntimeOptions) {
    if (!options.baseUrl.trim()) throw new RuntimeError("RUNTIME_CONFIG", "baseUrl is required");
    if (!options.token.trim()) throw new RuntimeError("RUNTIME_CONFIG", "token is required");
    assertSafeRuntimeUrl(options.baseUrl, "baseUrl", options.allowInsecureHttp === true);
    if (options.callbackUrl?.trim()) {
      assertSafeRuntimeUrl(
        options.callbackUrl.trim(),
        "callbackUrl",
        options.allowInsecureHttp === true,
      );
    }
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
    this.#keyId = options.keyId?.trim() || DEFAULT_KEY_ID;
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
        redirect: "error",
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
    const descriptor = validateJobPayload(job.payload);
    const payload = this.#callbackUrl
      ? {
          ...descriptor,
          callback: { url: this.#callbackUrl, job_id: job.id },
        }
      : descriptor;
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

function assertRootSecret(rootSecret: string): void {
  if (rootSecret.length < MIN_ROOT_SECRET_LENGTH) {
    throw new RuntimeError(
      "RUNTIME_CONFIG",
      `a callback root secret of at least ${MIN_ROOT_SECRET_LENGTH} characters is required`,
    );
  }
}

export function deriveJobSecret(
  rootSecret: string,
  jobId: string,
  keyId = DEFAULT_KEY_ID,
): string {
  assertRootSecret(rootSecret);
  return createHmac("sha256", rootSecret)
    .update(`latent-callback:${keyId}:${jobId}`)
    .digest("hex");
}

/** Length-prefixed, domain-separated canonical form; no separator ambiguity. */
function canonicalCallback(
  keyId: string,
  jobId: string,
  timestamp: string,
  nonce: string,
  body: string,
): string {
  return [
    "latent-runtime-callback-v1",
    keyId,
    jobId,
    timestamp,
    nonce,
    body,
  ]
    .map((field) => `${Buffer.byteLength(field, "utf8")}:${field}`)
    .join("");
}

export interface CallbackInput {
  secret: string;
  jobId: string;
  timestamp: string;
  nonce: string;
  body: string;
  keyId?: string;
}

export function signJobCallback(input: CallbackInput): string {
  const keyId = input.keyId ?? DEFAULT_KEY_ID;
  const jobSecret = deriveJobSecret(input.secret, input.jobId, keyId);
  return createHmac("sha256", jobSecret)
    .update(
      canonicalCallback(
        keyId,
        input.jobId,
        input.timestamp,
        input.nonce,
        input.body,
      ),
    )
    .digest("hex");
}

/** A stable hash a callback route can persist to reject a replayed signature. */
export function callbackSignatureHash(signature: string): string {
  return createHash("sha256").update(signature).digest("hex");
}

export interface VerifyCallbackInput extends CallbackInput {
  signature: string;
  toleranceSeconds?: number;
  now?: number;
  /**
   * Nonces already accepted. Required: a stateless verifier accepts a replay, so
   * the callback route must persist this set (or callbackSignatureHash) against
   * the job's terminal state and pass it in.
   */
  seenNonces: Set<string>;
}

/**
 * Verify a job-scoped callback. The signature covers key id, job id, timestamp,
 * a nonce and the raw body with length prefixes, so different field pairs cannot
 * collide. A future timestamp or one older than the tolerance is rejected. When
 * `seenNonces` is supplied, the check-and-add is synchronous, so a replayed
 * signature fails even inside one process; a callback route persists the same
 * set (or `callbackSignatureHash`) for durability.
 */
export function verifyJobCallback(input: VerifyCallbackInput): boolean {
  const timestamp = Date.parse(input.timestamp);
  if (!Number.isFinite(timestamp)) return false;
  if (input.nonce.trim() === "" || input.nonce.length > 128) return false;
  const now = input.now ?? Date.now();
  const tolerance = (input.toleranceSeconds ?? CALLBACK_TOLERANCE_SECONDS) * 1000;
  if (timestamp - now > MAX_FUTURE_SKEW_MS) return false;
  if (now - timestamp > tolerance) return false;
  const expected = signJobCallback(input);
  const left = Buffer.from(expected);
  const right = Buffer.from(input.signature);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    return false;
  }
  if (!(input.seenNonces instanceof Set)) {
    throw new RuntimeError(
      "CALLBACK_GUARD_REQUIRED",
      "seenNonces is required; persist it against the job's terminal state",
    );
  }
  if (input.seenNonces.has(input.nonce)) return false;
  input.seenNonces.add(input.nonce);
  return true;
}
