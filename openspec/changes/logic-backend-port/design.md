# Design

## The port

`LogicBackend` (`begin`, `query`, `check`, `exportText`, `close`) and `LogicTransaction` (`set`, `remove`,
`replaceAll`, `query`, `commit`, `abort`), one backend per opened checkout. The transaction mirrors the write lock:
a write's program changes and the queries inside it go through the write's transaction; reads outside a write query
the committed programs. The checkout opens at most one transaction, only under its write lock, so a backend needs no
isolation between transactions.

- **Abort means "the caller rebuilds".** After `abort`, or a refused commit, the committed programs are unspecified
  until the checkout's next `replaceAll` commits. This lets a backend apply changes in place, as clingo does, and the
  checkout already rebuilt its caches after a failed write. Rejected: requiring abort to restore the committed state,
  which clingo can only do by copying every program. Until the rebuild commits, reads that need the backend fail as
  unavailable rather than answer from those programs, and a failed rebuild is queued again after the write.
- **A failed query inside a transaction leaves it open.** Side-effect cascades catch failed queries and continue; a
  backend that ended the transaction would fail the whole write at its commit.
- **`check` covers one program at a time.** It serves the calculation write-time gate, project validation and the
  build-time skip of invalid calculations, and runs with a transaction open, so it never waits for it. Problems of
  the project as a whole belong to the commit, which a backend may refuse (nonTotal, invalid); the write then fails
  like any failed write. Rejected: evaluating a checked program with the project, which costs clingo whole-project
  solves per calculation edit and duplicates the commit's refusal.
- **`commit({ keepNonTotal })`** marks rebuilds from the files, which must not be refused, or a project left without
  a total answer could not be opened or recovered.
- **`resync` through the owner.** A backend that lost its programs (its store restarted) cannot rebuild them; it
  fails the call as `unavailable` and asks the checkout, which rebuilds under its lock once the running operation
  has ended. The backend must not await it inside its own call, which runs under that lock.
- **No write deltas.** Every write still ends with `replaceAll`, as it regenerated every program before. Sending only
  what a write changed is a separate change; the port already carries `set` and `remove` for it.
- Programs carry a role (knowledge or query) so a backend that treats them differently need not guess from keys.
  Role, `keepNonTotal` and the owner's id have no reader in clingo; their named consumer is the SaaS distribution's
  backend, which serves many checkouts from one store and refuses results without a total answer.

Cost to reverse: the port is internal to data-handler and its one composition point (`CheckoutOptions.logic`);
removing it means inlining clingo again.

## Errors

`LogicError` is a `DomainError` with code `logic` and the kind in its details. Only the kinds a caller acts on are
kept: fix the request (invalid), fix the project (nonTotal), retry (unavailable), report (internal). The backend's
error handler maps them to HTTP; route catches that answer other failures with a status of their own rethrow a
`LogicError` first, so it reaches that one place. `Retry-After` is 5 seconds, the order of a rebuild.

Invalid is 400 also when the failing program is the project's own (a stored calculation that fails at grounding);
telling the two apart needs the backend to say which program failed, which is left open.

## Disposed checkouts

The backend is closed when the checkout is disposed. A write queued behind the dispose would write its files and then
fail on the closed backend, with no rollback for a disposed checkout; so the checkout's lock refuses every operation
once disposed. Rejected: refusing only writes, as reads would then reach a closed backend.

## createServer and /livez

A distribution composes the server from its own auth provider and logic backend instead of copying `main.ts`.
`/livez` answers whenever the process serves HTTP and checks no dependency, so an outage of the logic backend does
not get a working container restarted. A readiness endpoint and a graceful stop are left out until a consumer needs
them.

## Open questions

- Should invalid programs of the project's own be served as 500 rather than 400?
