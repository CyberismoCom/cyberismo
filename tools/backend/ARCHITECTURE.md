# backend architecture

The Hono HTTP adapter over `@cyberismo/data-handler`. It maps HTTP requests to
`Workspace` calls and results to JSON, and owns auth, the SSE event stream and
static-site export. It holds no project rules; those live in data-handler.

## Structure

| Folder        | What it is                                                                                                                                     |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `domain/<x>/` | One route module per URL area (not a rules layer): `index.ts` Hono router, `schema.ts` zod, `service.ts` Workspace calls and response mapping. |
| `middleware/` | Auth and roles, project/workspace attach (`commandManager.ts`), tree, validation.                                                              |
| `auth/`       | Providers behind the `AuthProvider` interface (`keycloak.ts`, `mock.ts`).                                                                      |
| `common/`     | Shared request schemas and HTTP error mapping.                                                                                                 |
| root files    | `app.ts` wires routers; `main.ts`/`index.ts` start and export; `export.ts` static site; `overlay.ts`; `types.ts`; `utils.ts`.                  |

## Dependencies

- May use `@cyberismo/data-handler` (package root only), `@cyberismo/model`, and `@cyberismo/mcp` (hosted in `domain/mcp/`). Never `@cyberismo/cli`.
- `@cyberismo/app` is a build-time input only: `build` copies `../app/dist` to `dist/public`, served by `app.ts`.
- Inside: `domain/` -> `middleware/`, `common/`, `types.ts`; `auth/` and `common/` import no route module; `app.ts` imports routers via `index.ts`.
- Enforced: `package.json` workspace dependencies (pnpm resolves only declared packages) and data-handler's `exports`. Inside rules are checked in review, not linted.

## Key concepts and invariants

- Adapter only: parse and validate input, call the Workspace, map the result. No business rules, defaults or orchestration.
- Only `index.ts` and middleware import `hono`; a service is plain TypeScript.
- Every route declares a minimum role; an identifier from a request is resolved against the project before use.
- Errors map to status codes in one place (`common/errors.ts`); client-facing errors stay generic.
- Adapter tests check mapping (status, shape, role) and do not re-test Workspace behaviour.

## Known debt

- `src/domain/` means "route modules", the opposite of data-handler's `domain/`; cross-area and upward imports exist (no ticket yet).
- Fat routers (`domain/cards/index.ts`, `domain/resources/`) and rules leaking in via `Validate`.
