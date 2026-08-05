## Package manager

Use `pnpm`, never `npm` or `yarn`.

## Fresh clone / worktree setup

Install Vite+ once per machine — it provisions Node and pnpm itself, so nvm and
corepack are not needed for this repo:

```
curl -fsSL https://vite.plus | bash
```

Then per clone or worktree:

1. `git submodule update --init --recursive` — **before** installing;
   `node-clingo` builds native code from the `clingo` and `BS_thread_pool`
   submodules during install
2. `vp install`

Notes:

- Node comes from `.node-version` (22). `vp` puts itself first on `PATH`, so it
  takes precedence over an existing nvm install without uninstalling anything.
- The native build needs CMake and a C++ toolchain (node-gyp)
- To skip the native build (e.g. no toolchain, or bindings already built):
  `vp install --ignore-scripts`

## Common commands

- `vp install` — install deps (delegates to the pnpm pinned by `packageManager`)
- `pnpm build` — build all packages (`vp run -r --cache build`, dependency-aware + cached)
- `pnpm test` — run all tests. Use this, **not** bare `vp test`: at the
  workspace root `vp test` collapses every test file into one Vitest run under
  the root config, ignoring each package's own `vitest.config.ts`
- `pnpm test-<package>` — one package's tests (e.g. `pnpm test-data-handler`, `test-cli`, `test-app`, `test-backend`, `test-clingo`, `test-mcp`)
- `pnpm lint` — oxlint (type-aware) across the whole workspace in one pass
- `pnpm prettier-check` / `pnpm prettier-fix` — formatting (oxfmt)
- `pnpm check` — `vp check`: format + lint in one pass; prefer this as the validation loop
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
- New source files start with the AGPL-3.0 copyright header — copy the `/** Cyberismo ... */` block from any existing source file
- C++ code in `node-clingo` is format-checked in CI: `pnpm --filter node-clingo format:cpp:check`

## Testing

- Vitest, imported as `vite-plus/test` (Vite+ re-exports it; do not import `vitest` directly)
- Tests live in `test/` dirs (or `__tests__/` in app)
- Never commit `.only()` in tests
- `pnpm test-app` runs unit tests **and** Playwright e2e — install browsers first: `pnpm --filter=app exec playwright install --with-deps`

## Key patterns

- Zod for runtime validation
- Hono for backend routing
- SWR for frontend data fetching
- Redux Toolkit for non-fetching related state management
- File-based storage with Git integration (no database)

## Toolchain

Vite+ (`vp`) is the single entry point: Vite 8 (dev/build), Vitest (test), Oxlint
(lint, type-aware), Oxfmt (format), and a cached workspace task runner.

There are two halves, and both are needed:

- the **machine-wide install** provisions Node and pnpm and is what puts `vp` on
  `PATH`
- the **`vite-plus` devDependency** pins the toolchain — the `vite`, `vitest`,
  `oxlint`, `oxfmt` and `tsdown` versions all come from it, so it is what keeps
  lint and format results identical across machines and CI. `vp --version`
  reports both halves.

Lint and format rules live in the `lint` / `fmt` blocks of the root
`vite.config.ts` — there is no `.eslintrc`, `eslint.config.js` or `.prettierrc`.
Three packages (app, assets, backend) also define their `build` task in their own
`vite.config.ts` so it can declare `input`/`output`; those have no `build` script
in `package.json`.

## Node version

22, pinned in `.node-version` and provisioned by Vite+.
