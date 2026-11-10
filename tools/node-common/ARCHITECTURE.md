# node-common

Non-browser code shared by the Node packages (data-handler, cli, backend,
migrations, mcp). Browser code (app) must not import it.

## Layout

- One subpath export per tenant (`@cyberismo/node-common/log`). There is no root
  barrel and no `main`; consumers import the subpath they need.
- A tenant lives in `src/<name>/` with an `index.ts` as its public surface.
- Add a tenant only when two or more packages need the same Node-only code.

## Logging (`/log`)

Logging is process-wide and host-configured.

- Entry points (CLI, backend server, MCP server) call `configureLogging` once,
  choosing destinations (file, stdout, stderr, or a stream) and their levels.
- Library code calls `getLogger({ module: '...' })` and logs. It never
  configures logging, never opens destinations, never reads log settings from
  the environment, and never writes to the console.
- A logger obtained before `configureLogging` works afterwards: the handle
  resolves the current destinations on every call. Unconfigured, logging is a
  no-op.
- Calling `configureLogging` again replaces all destinations and closes the
  files it had opened.
- `projectLogFile(dir)` names the per-day project log file; the file's
  directory gets a `.gitignore` so logs are never committed.
