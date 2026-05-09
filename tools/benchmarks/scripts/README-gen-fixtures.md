# Generating benchmark fixtures

The benchmark fixture generator (`pnpm --filter @cyberismo/benchmarks bench:gen-fixtures`)
materialises one self-contained fixture tree per (project, scale) pair under
`<output-dir>/<project>/<scale>/`. Each fixture contains the scaled project
tree plus the LP programs and ASPIF base used by the various benchmark
variants.

## `--fast` flag

By default the generator scales each project up by repeatedly invoking
`commands.createCmd.createCard(template)`. That call performs:

- Template + schema validation.
- Card key allocation.
- Metadata processing (incl. `templateCardKey`, initial workflow state).
- Attachment processing (filename rewrites, content updates).
- `mkdir` + write of `index.json` + `index.adoc`.
- `handleNewCards`, which fires the `onCreation` Clingo query
  (`tools/assets/src/calculations/queries/onCreation.lp`). Any matching
  `onTransitionSetField` / `onTransitionExecuteTransition` rules then run
  per newly-created card.

For the two configured benchmark projects the per-card overhead dominates
fixture-generation wall time but is functionally redundant:

- `cyberismo-docs` + `base/templates/page` — produces a single
  `base/cardTypes/page` card per instance.
- `module-eu-cra` + `secdeva/templates/project` — produces 41 cards per
  instance.

Across all 53 calculation files in the two projects, no
`onTransitionSetField` / `onTransitionExecuteTransition` rule's preconditions
match any of the cards these templates produce. `creationQuery` returns an
empty result set; `handleNewCards` is a no-op for these benchmarks.

`--fast` opts into a path that:

1. Calls `createCard` ONCE to produce a known-good seed instance (paying
   validation + the empty `creationQuery` once).
2. Snapshots the seed instance's on-disk subtree into memory.
3. Replicates the subtree until the target card count is reached, allocating
   fresh card keys (`<projectPrefix>_b<n>`) and rewriting `links[].cardKey`
   entries that reference seed-instance cards.

Default: `--fast` is OFF. Existing behaviour is unchanged.

## When NOT to use `--fast`

If you add a new project (or a new template within an existing project) that
has any `onTransitionSetField` / `onTransitionExecuteTransition` rule whose
preconditions DO match an instance card, `--fast` will silently produce
fixtures that differ from the slow-path output: the fields the rule sets
will be missing, and any cascading transitions will not have run.

Before enabling `--fast` for a new (project, template) combo:

1. Audit the project's calculation files
   (`<project>/.cards/**/calculations/**.lp`).
2. Confirm none of the rules' preconditions match the cards the template
   instantiates.
3. If a rule does match, either don't use `--fast`, or extend
   `fastScaleProject` to replay the relevant transitions.

A reasonable cross-check: scale a small project (~250 cards) under both
`scaleProject` and `fastScaleProject`, then diff the per-card-type counts
and the index.json field sets.

## Usage

```bash
# Slow path (default)
pnpm --filter @cyberismo/benchmarks bench:gen-fixtures /tmp/fixtures \
  --scale-min 1000 --scale-max 5000 --scale-step 1000

# Fast path
pnpm --filter @cyberismo/benchmarks bench:gen-fixtures /tmp/fixtures \
  --scale-min 1000 --scale-max 5000 --scale-step 1000 \
  --fast

# Parallel driver
tools/benchmarks/scripts/gen-fixtures-parallel.sh /tmp/fixtures \
  --scale-min 1000 --scale-max 5000 --concurrency 4 --fast
```
