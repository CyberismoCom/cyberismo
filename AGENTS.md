## Package manager

Use `pnpm`, never `npm` or `yarn`.

## Common commands

- `pnpm install` — install deps
- `pnpm build` — build all packages
- `pnpm test` — run all tests
- `pnpm lint` — eslint all packages
- `pnpm prettier-check` / `pnpm prettier-fix` — formatting

## Monorepo structure

pnpm workspaces under `tools/`:

- `app` — React 19 + Vite frontend
- `backend` — Hono server
- `cli` — CLI (`cyberismo` command)
- `data-handler` — core business logic
- `mcp` — Model Context Protocol server
- `node-clingo` — native Clingo bindings
- `assets` — shared JSON schemas and static content
- `migrations` — schema migrations

Internal deps use `"workspace:*"` and are imported as `@cyberismo/<package>`.

## Code style

- TypeScript strict mode, ES modules (`"type": "module"`)
- File extensions required in imports (`.js` even for `.ts` files — NodeNext resolution)
- **`.js` in every relative import** — even though source files are `.ts`:
  ```typescript
  // CORRECT
  import { Project } from './containers/project.js';
  // WRONG
  import { Project } from './containers/project';
  ```
- Use `node:` prefix on Node built-ins: `import { join } from 'node:path'`

## Testing

- **Vitest**: app, backend, mcp, node-clingo
- **Mocha + Chai**: cli, data-handler
- Tests live in `test/` dirs (or `__tests__/` in app)
- Never commit `.only()` in tests (enforced by `--forbid-only`)

## Key patterns

- Zod for runtime validation
- Hono for backend routing
- SWR for frontend data fetching
- Redux Toolkit for non-fetching related state management
- File-based storage with Git integration (no database)

## Node version

22 LTS
