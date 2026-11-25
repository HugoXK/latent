# Security policy

## Reporting a vulnerability

Use GitHub's private vulnerability reporting (**Security → Report a
vulnerability**) with:

- a description and impact;
- a minimal reproduction (request, payload, steps);
- the affected version or commit;
- whether the issue is already public.

Please do not open a public issue for a vulnerability. A first response is expected
within 72 hours. If the issue is confirmed, a fix and a coordinated disclosure date
will be agreed with you.

## Scope

In scope:

- authentication, sessions, CSRF and token handling;
- encryption at rest for fragments, blobs and provider keys;
- the claim ledger, verifiers and gate engine (including bypasses);
- provider consent and the redaction of private data;
- prompt injection through retrieved content;
- the runtime callback contract and scoped job tokens;
- biosafety and dual-use classifiers in science verticals;
- secret handling in logs, errors and telemetry.

Out of scope:

- vulnerabilities in a model provider, a search provider, the runtime (FlyBot), or
  the user's operating system;
- denial of service from a compromised host account;
- social engineering;
- content the user deliberately publishes.

## Safe harbour

Good-faith research that avoids privacy violations, data destruction and service
disruption is welcome. Do not access other users' data, run jobs against
repositories you do not own, or attempt to bypass a gate on a live instance.

## Design

The full threat model, data classification and controls are in
[docs/security.md](docs/security.md). The short version: fragments are sensitive,
local-first is the default, retrieved content is untrusted, and a hard gate is
human-only.
