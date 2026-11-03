# data-handler architecture

The core library: it opens a project checkout and exposes every read and write as a `Workspace` API. It owns
the project rules (cards, resources, modules, queries, validation, versions). The adapters (backend, cli, mcp)
call it and hold no rules of their own.

## Structure

| Folder              | What it is                                                                                                                                     |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `api/`              | The consumer surface: `directory/` (open, create, clone), the `Workspace` handle, one API class per area (`ws.cards`, …).                      |
| `domain/<concept>/` | Operations and rules for one concept (`cards`, `macros`, `modules`, `queries`, `resources`, `validation`, `versions`). `index.ts` is the door. |
| `state/`            | The checkout core: `Checkout`, card tree, resource cache, calculation engine.                                                                  |
| `infra/`            | Plumbing with no knowledge of project state: git, locks and change feed (`tx/`), replay log, clingo parsing, module sources, paths.            |
| `shared/`           | Exceptions, types, interfaces and pure helpers.                                                                                                |

## Dependencies

- Imports point down: `api/` → `domain/` → `state/` → `infra/` → `shared/`. `shared/` imports nothing above it.
- `api/` reaches a concept only through `domain/<concept>/index.ts`. New code between concepts does the same.
- No relative `import()` in `src/`, because it hides cycles.
- Consumers import the package root only. `@cyberismo/data-handler` imports no adapter.
- Enforced by `eslint.config.js` for the layer direction, `api/` doors and `import()`. Domain-to-domain doors
  are checked in review.

## Key concepts and invariants

- An API class is thin: it binds the actor, takes the lock and commit frame, calls domain operations and copies
  what it returns. Logic lives in `domain/`.
- Every write goes through an API class, so it is locked, attributed and committed together. Nothing writes the
  checkout from outside.
- `shared/` is project-independent: no `Checkout`, no `Workspace`, no concept rules. A helper used by one concept
  lives in that concept.
- Values returned to consumers are copies and serializable. Wire types live in `@cyberismo/model`.
- Tests call the `Workspace` and are organised by concept; only `test/state/` touches checkout internals
  (`docs/dev/testing.md`).

## Known debt

- `Checkout` does too much (files, git, lock, change feed, tree, caches, engine), and domain concepts import each
  other in cycles without doors.
- Validate is a process-wide singleton used across layers. Fat API classes (`Modules`, `Export`, `Clean`).
  `shared/utils` is an accidental public export.
