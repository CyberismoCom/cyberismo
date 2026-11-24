# mcp architecture

The Model Context Protocol adapter over `@cyberismo/data-handler`. It exposes
Workspace operations as MCP tools, resources and prompts for agents, and is
hosted by the backend (`backend/src/domain/mcp/`). It holds no project rules;
those live in data-handler.

## Structure

| Folder / file            | What it is                                                                                         |
| ------------------------ | -------------------------------------------------------------------------------------------------- |
| `server.ts`              | `createMcpServer`: builds the server and registers tools, resources and prompts.                   |
| `index.ts`               | Public surface: `createMcpServer`, `McpServerOptions`, `McpUser`.                                  |
| `tools/`                 | Tool definitions (`index.ts`) and shared zod input schemas (`sharedSchemas.ts`).                   |
| `resources/`, `prompts/` | MCP resources and prompts (`index.ts` each).                                                       |
| `lib/`                   | `resolve-project.ts` (project, workspace, `McpUser`), `render.ts` (result text), `mcp-helpers.ts`. |

## Dependencies

- May use `@cyberismo/data-handler` (root entry) and `@cyberismo/model`. Never `@cyberismo/backend` (it depends on mcp) or `@cyberismo/cli`.
- Inside: `tools/`, `resources/`, `prompts/` use `lib/` and not each other; only `server.ts` imports them.
- No `node:fs`, `node:child_process` or git in `src/`: all I/O goes through the Workspace.
- Enforced: `package.json` workspace dependencies (pnpm resolves only declared packages) and data-handler's `exports`. Inside rules are checked in review, not linted.

## Key concepts and invariants

- Adapter only: tool input -> Workspace call -> rendered text for an agent. No business rules or defaults.
- The acting user comes from `McpUser` via `resolve-project.ts`; a tool never picks a project on its own.
- Write tools go through the same Workspace operations as every other adapter, so they obey the same guards.
- Adapter tests check mapping (input, Workspace call, rendered result), not domain behaviour.

## Known debt

- `tools/index.ts` holds every tool in one file; `lib/render.ts` and `resources/index.ts` mix formatting with selection.
- Identity mapping (`McpUser`) is split with `backend/src/domain/mcp/`.
