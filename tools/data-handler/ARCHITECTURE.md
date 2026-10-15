# data-handler architecture

`src/` has five folders. Imports point down; `eslint.config.js` enforces it.

| Folder    | What it is                                                                                                                           |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `api/`    | The consumer surface: `directory/` (open, create, clone), the `Workspace` handle, and one API class per area (`ws.cards`, ...).      |
| `domain/` | Operations and rules, as plain functions and resource classes, one folder per concept. Each folder's `index.ts` is its door.         |
| `state/`  | The checkout core: `Checkout`, card tree, resource cache, calculation engine. I/O and in-memory state together.                      |
| `infra/`  | Plumbing that knows nothing of a project's state: git, locks and the change feed, replay log, clingo parsing, module sources, paths. |
| `shared/` | Utilities, types, exceptions and interfaces with no layer of their own.                                                              |

An API class binds an actor, takes the lock and commit frame, copies what
it returns, and calls domain operations on the checkout.

## Dependency rules

| From \ may import | api/          | domain/                 | state/     | infra/     | shared/ |
| ----------------- | ------------- | ----------------------- | ---------- | ---------- | ------- |
| `api/`            | yes           | only via `<x>/index.ts` | yes        | yes        | yes     |
| `domain/`         | Validate only | yes                     | yes        | yes        | yes     |
| `state/`          | no            | allowlisted             | yes        | yes        | yes     |
| `infra/`          | no            | no                      | no         | yes        | yes     |
| `shared/`         | no            | no                      | types only | types only | yes     |

No relative `import()` in `src/`: it hides a cycle from these rules.

## Where new code goes

- A new operation or rule on a concept: `domain/<concept>/`, as a function
  over the checkout. Expose it to consumers through the API class in `api/`
  and the concept's `index.ts` door.
- A new method on `ws.<area>`: the API class in `api/<area>.ts`; keep it
  thin (actor, lock, copy) and put the logic in `domain/`.
- Something that reads or writes the checkout's files or caches: `state/`.
- Something that works without a project (git, locks, parsers, paths):
  `infra/`.
- A helper several layers need and that touches no project: `shared/`.
- Tests mirror the source path under `test/`.

## Known debt

- `Modules` (782 lines), `Export` and `Clean` are fat API classes: they
  carry logic that belongs in `domain/`. They moved as they were.
- `state/` mixes I/O and state. `Checkout` owns files, git, lock, change
  feed, card tree, resource cache and calculation engine.
- `state/` -> `domain/` edges (allowlisted in `eslint.config.js`):
  calculation engine -> report runner, checkout -> template resource (type)
  and Validate, project settings -> Validate, resource cache -> resource
  classes. `domain/validation/validate.ts` -> `api/workspace` (type).
  Validate's go with the validation redesign.
- Two file-wide relative `import()` exemptions: `domain/resources/resource-object.ts`
  (lazy Validate import, breaks a cycle) and `api/export.ts` (a redundant lazy
  import of a module also imported statically, left as-is in a moves-only PR).
- Each allowlist entry and exemption carries a reason comment in
  `eslint.config.js`; the tickets are yet to be filed.
- `domain/` -> `domain/` imports are not restricted to doors; only `api/`
  is held to `<x>/index.ts`.
- Tests are not fully mirrored yet: 19 test files plus `test-utils.ts`
  (`command-*`, `resources.test.ts`, `autocommit`, `skill-*`, ...) still sit
  at the `test/` root.
- `shared/` takes `Checkout` as a type in two files:
  `shared/interfaces/macros.ts` and `shared/utils/resource-utils.ts`.

## Direction

- `state/` splits into per-workspace stores (card index, resource index,
  fact cache) that domain code receives, instead of one `Checkout`.
- Resources become data owned by their domain, not classes that import the
  checkout back.
- Writes go through a single plan applier, with operations taking
  `(model, tx, ...)` rather than a checkout.
