# 0011 — Local API auth, scopes, CSRF and rate limits

- Status: proposed (T3, owner approval pending)
- Date: 2026-11-27
- Owner: HugoXK
- Issue: #50

## Context

The Fastify API listens on loopback and had no auth, no origin check, no rate
limit and no body limit. A loopback service is still reachable from a browser on
the same machine (CSRF, DNS rebinding) and from any local process. Latent handles
private thoughts, so "localhost only" is not an auth model.

The acceptance requires unauthenticated writes refused, CSRF enforced for browser
forms, a stable rate-limit error, and localhost as the default.

## Decision

1. **Loopback remains the default bind**: `127.0.0.1`. This ADR does not add TLS or
   a hosted ingress.
2. **Every `/v1` route requires a bearer token.** `/healthz` and `/readyz` stay
   public. Tokens are compared in constant time.
3. **The local token is resolved once, never printed.** Precedence:
   `LATENT_AUTH_TOKEN` → `LATENT_AUTH_TOKEN_FILE` → `data/runtime/auth-token`.
   If none exists, a 32-byte token is generated and written with mode `0600`. The
   server logs the source path, not the token. `data/runtime/` is git-ignored.
4. **Scopes are per route**: `fragments:read|write`, `ideas:read|write`,
   `gates:run`, `briefs:compile`, `memory:read`, `admin`. The default local token
   has all scopes; a caller may configure `authTokens` with narrower ones. `*`
   grants all.
5. **Host and Origin are checked before auth.** The `Host` hostname must be
   `127.0.0.1`, `localhost` or `::1` (DNS-rebinding defence). A request with an
   `Origin` must be same-origin with the `Host` or in `allowedOrigins`; otherwise
   `403 CSRF_FAILED`. CORS is not enabled.
6. **Per-token rate limit.** Default 120 requests/minute, configurable. The bucket
   key is a SHA-256 of the token, not the token. A limited request returns
   `429 RATE_LIMITED` with `Retry-After` and `retry_after_seconds`.
7. **Body limit.** Default 1 MiB, configurable; an oversized body returns
   `413 BODY_TOO_LARGE`.
8. **Tests bind the contract**: missing/invalid token, scope denial, cross-origin,
   non-loopback Host, rate limit and body limit.

## Migration note

None for stored data. A new runtime file `data/runtime/auth-token` is created on
first server start and is already covered by `.gitignore`. No schema change.

## Consequences

- Existing unauthenticated API clients break. That is intentional; the CLI uses the
  store directly and is unaffected. `curl` and integrations must read the token
  file or set `LATENT_AUTH_TOKEN`.
- Cookie sessions and per-form CSRF tokens are **not** implemented. There is no
  browser login yet; the Origin check is the current CSRF boundary. When a web UI
  lands (#51), it needs a session cookie plus a double-submit CSRF token.
- Rate-limit buckets are in memory, per process, and reset on restart. A hosted
  deployment needs a shared limiter.
- Token rotation is manual (replace the file/env and restart). Key custody and
  encryption at rest remain separate open work.
- The generated token file must never be committed or logged. The server logs the
  path only.

## Alternatives considered

- **Loopback only, no token.** Rejected: DNS rebinding and local malware.
- **Cookie session now.** Rejected: no UI and no login flow; bearer is the smaller
  correct step.
- **mTLS.** Rejected for a local single-user install; revisit for hosted.
- **Global rate limit by IP.** Rejected: a token key is more precise and avoids
  punishing unrelated local tools.

## Risks

- A user may paste the token into a shell history. The file path and `0600` mode
  reduce accidental exposure; rotation is manual.
- The in-memory bucket map can grow with many tokens; the current deployment has
  one or a few.
- The Origin check is not a substitute for a CSRF token once cookies exist.
