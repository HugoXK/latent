# Decision records

One file per decision, numbered `NNNN-<slug>.md`, next free number.

## Template

```markdown
# NNNN — <decision>

- Status: proposed | accepted | superseded by NNNN
- Date: YYYY-MM-DD
- Decision owner: <who decides, and on whose authority>
- Context issue: #N

## Context

What happened, and what is missing if we do nothing.

## Decision

What we decided, stated so a later change can argue against it.

## Alternatives

What else we considered and why we rejected it.

## Risk and rollback

What the change can break, and the exact way back.

## Reconsider when

The trigger that reopens this — dates, counts, or a named event.
```

## Evidence rule

Any claim that one or more reviews reproduced, confirmed or independently found X
must name the reviews it rests on (PR number + verdict timestamp + head SHA), or
the claim is removed. "Review found…" without a citation is not evidence. The
same rule is stated in `docs/code-standards.md`.
