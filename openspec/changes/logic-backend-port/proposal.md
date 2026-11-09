# Proposal

## Why

A distribution of Cyberismo cannot replace the logic backend: clingo is created inside the calculation engine,
`ClingoError` is matched in four macro files, the calculation write-time gate calls clingo's parser directly, and
nothing closes a checkout's clingo context. The server can only be started by its own `main.ts` and has no endpoint
a container healthcheck can use. Logic failures reach HTTP clients as 500, or as whatever status a route's own catch
picks, so a client cannot tell its own mistake from an outage it should retry.

## What Changes

- A transactional, asynchronous `LogicBackend` port, injected per opened checkout through the open options
  (`logic`, a factory given the checkout's owner: an id per opening, the prefix as a label, and `resync`). Clingo is
  the default; its native binding loads on first use. The checkout closes its backend when it is disposed, once the
  running operation has ended. Every write still replaces all programs at its end (`replaceAll`).
- A backend that lost its programs asks for them with `resync`; the checkout rebuilds them from the files once the
  running operation has ended.
- A write whose result the backend refuses at commit fails like any failed write. Rebuilds from the files (open,
  resync, after a failed write) are never refused. The clingo backend refuses nothing at commit.
- An operation that reaches a disposed checkout is refused (`WorkspaceDisposedError`), also one queued before the
  dispose. **Behaviour change**: a request that resolved its project just before the project was replaced fails
  instead of running on the old checkout.
- Logic failures are one `LogicError` with a kind: invalid (with diagnostics), nonTotal (with a sample),
  unavailable, internal. The macros match it instead of `ClingoError`.
- **Behaviour change**: a logic failure reaching the HTTP edge is served with the new error code `logic`, its kind
  in the details and the status of its kind: invalid 400, nonTotal 422, unavailable 503 with `Retry-After`, internal 500. It was 500 with code `internal`, or the status of the route's own catch.
- The calculation write-time gate, project validation and the skip of invalid calculations when the program is
  built check each program on its own through the backend, as they did with clingo directly. Problems of the
  project as a whole are refused at commit.
- `@cyberismo/backend` exports `createServer(config, { auth, directory, logic })`, replacing `startServer`
  (**BREAKING** for its importers; none outside this repository). The server answers `GET /livez` without an
  identity.
- A private package `@cyberismo/logic-contract` holds the contract tests every logic backend must pass; its own
  tests run them on clingo.

Change class: **behaviour** (B).

Architecture impact: `tools/data-handler/ARCHITECTURE.md` (the port in `infra/logic/`), `tools/backend/ARCHITECTURE.md`
(`createServer`), and a new `tools/logic-contract/ARCHITECTURE.md`.

## Out of scope

Write deltas (each write keeps replacing every program), cancellation of logic work, deadlines per logic call, a
readiness or health endpoint with details, stopping the server, and running the `onTransition` query after a
commit. Each can follow as its own change.
