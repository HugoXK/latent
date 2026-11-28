# Novelty

- Status: implemented (local)
- Date: 2026-11-26
- Owner: HugoXK

Novelty is a **structured comparison**, not an embedding similarity. The package
[`packages/novelty`](../packages/novelty/src/index.ts) turns a candidate and a
prior-art graph into a collision report the brief can carry.

## The graph

- Nodes: `project`, `part`, `mechanism`, `host`, `readout`, `substrate`,
  `evidence`, `idea`.
- Edges: `uses`, `improves`, `collides_with`, `requires`.
- A project node carries its mechanism, interface, host, readout, substrate and
  an optional sequence hash.

The graph is a typed store, not a vector index. It is built from the corpus in
#39 and can be exported for audit.

## The canonical tuple

Every candidate and prior project is reduced to:

```
(mechanism, interface, host, readout, substrate)
```

Normalization lowercases, collapses punctuation and maps known aliases (for
example `ArsR` → `arsenic-responsive-repressor`) so the comparison is stable.
The canonical tuple is the unit of a collision, not a free-text description.

## Collision kinds

| Kind | Meaning | Severity |
|---|---|---|
| `mechanism` | the mechanism **and** interface collide | high: block |
| `interface` | the mechanism collides, but the host/readout/sample differs | medium: argue interface novelty |
| `sequence` | the sequence hash matches a prior part | high: treat as the same part |

A mechanism collision alone is not a kill. A mechanism **and** interface
collision is. This is the rule the iGEM vertical already states in
[`vertical-igem.md`](vertical-igem.md).

## Brief

`toBriefCollisions(report)` maps the hits to the optional `collisions` field in
the `Brief`. `renderCollisionMarkdown(report)` produces the section for the
Markdown brief:

- verdict (`novel`, `interface`, `blocked`);
- the novelty argument;
- every hit with its prior and severity.

## Limitations

- Sequence collision is a hash comparison, not BLAST; a real BLAST adapter is
  #37.
- The graph only knows what was ingested. A `novel` verdict means "not in the
  indexed corpus", not "not in the world".
- The canonical family map is deliberately small and explicit; add an alias with
  a test, not a fuzzy heuristic.
