# OpenSpec in Cyberismo

Behaviour contracts live here: `specs/<capability>/spec.md` is what the system
does now; `changes/<name>/` holds a proposed change (proposal, spec deltas,
design) until it is archived into `specs/`. Config: [config.yaml](config.yaml).

## When a change needs OpenSpec

- **Behaviour (B)** changes (rubric class): yes. Create one with `/opsx:propose`.
- **Mechanical (M)** and **refactor (R)** changes: no. The PR body says so.
- `design.md` replaces ADRs. A proposal states its architecture impact: none, or
  which `tools/<pkg>/ARCHITECTURE.md` changes (in the same PR).

## Backfill

The current behaviour was specified once, in a single bootstrap commit. From then on, specs change only
through OpenSpec changes.

## Tests cite scenarios

A test name is `<capability>: <Scenario name>`, exactly as in the spec:

```ts
it('card-rename: Rename onto an existing prefix is rejected', …)
```

Every scenario has a test citing it; no test cites a scenario that does not
exist. `/review-pr` checks both ways.

## Archived specs are not edited by hand

`openspec/specs/**` and `openspec/changes/archive/**` change only through
`openspec archive`.

## Install

Install the `openspec` CLI (`@fission-ai/openspec`, MIT; Node 22.12+). It is not a repo dependency during the pilot.

## Validate

```sh
pnpm exec openspec validate --all --strict
```

Run it before opening the PR. A change with no spec deltas fails validation.
