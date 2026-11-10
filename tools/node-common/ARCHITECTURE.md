# node-common

Non-browser code shared by the Node packages (data-handler, cli, backend,
migrations, mcp). Browser code (app) must not import it.

## Layout

- One subpath export per tenant (`@cyberismo/node-common/log`). There is no root
  barrel and no `main`; consumers import the subpath they need.
- A tenant lives in `src/<name>/` with an `index.ts` as its public surface.
- Add a tenant only when two or more packages need the same Node-only code.

## Logging (`/log`)

Logging is process-wide and host-configured. Entry points (the CLI, the
standalone backend, an embedding host) call `configureLogging` once, choosing destinations (file,
stdout, stderr, or a stream) and their levels. Library code calls
`getLogger({ module: '...' })`.

The rule for data-handler, backend, mcp and migrations:

- emit application logs through `getLogger` only;
- never write to `console` or `process.stdout`/`process.stderr`;
- hand information meant for the user back to the caller (return value or
  thrown error); the entry point prints it;
- never choose a log destination and never read logging configuration from env
  or flags. Only process entry points call `configureLogging`.

A logger obtained before `configureLogging` works afterwards: the handle
resolves the current destinations on every call. Unconfigured, logging is a
no-op. Calling `configureLogging` again replaces all destinations and closes the
files it had opened.

`projectLogFile(dir)` names the per-day project log file in `<dir>/.logs`; that
directory gets a `.gitignore` (if missing) so logs are never committed.
