## Package manager

Use `pnpm`, never `npm` or `yarn`.

## Fresh clone / worktree setup

- Init submodules **before** `pnpm install`: `git submodule update --init --recursive` — `node-clingo` builds native code from the `clingo` and `BS_thread_pool` submodules during install
- The native build needs CMake and a C++ toolchain (node-gyp)
- To skip the native build (e.g. no toolchain, or bindings already built): `pnpm install --ignore-scripts`

## Common commands

- `pnpm install` — install deps
- `pnpm build` — build all packages
- `pnpm test` — run all tests
- `pnpm test-<package>` — one package's tests (e.g. `pnpm test-data-handler`, `test-cli`, `test-app`, `test-backend`, `test-clingo`, `test-mcp`)
- `pnpm lint` — check SPDX headers and eslint all packages
- `pnpm prettier-check` / `pnpm prettier-fix` — formatting
- `pnpm dev` — run all packages in dev/watch mode
- `pnpm cyberismo` — run the CLI from source
- `pnpm check-licenses` — dependency license allowlist check (run when adding deps; CI enforces)

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
- Every source file we own (TS/JS, C++, CSS, HTML, `.lp`, shell and other scripts) starts with exactly these two lines (directly after the shebang, if any), no year, no other text, in the file's comment style (`//` TS/JS/C++, `/* */` CSS, `<!-- -->` HTML, `%` `.lp`, `#` shell):
  ```typescript
  // SPDX-FileCopyrightText: Cyberismo Ltd and contributors
  // SPDX-License-Identifier: AGPL-3.0-only
  ```
- No headers on configuration files (YAML, JSON, dotfiles, Dockerfiles), under the prefixes in `EXCLUDES` in `scripts/check-headers.mjs` (vendored `external/`, `docs/`, `module-test/`, test data), or on the non-`.ts` files in `tools/assets/src`. Never edit third-party headers or files.
- `pnpm lint` checks the headers (`scripts/check-headers.mjs`); `pnpm fix-headers` adds or repairs them
- C++ code in `node-clingo` is format-checked in CI: `pnpm --filter node-clingo format:cpp:check`

## Testing

- Vitest
- Tests live in `test/` dirs (or `__tests__/` in app)
- Never commit `.only()` in tests
- `pnpm test-app` runs unit tests **and** Playwright e2e — install browsers first: `pnpm --filter=app exec playwright install --with-deps`

## Key patterns

- Zod for runtime validation
- Hono for backend routing
- SWR for frontend data fetching
- Redux Toolkit for non-fetching related state management
- File-based storage with Git integration (no database)

## Node version

22 LTS
