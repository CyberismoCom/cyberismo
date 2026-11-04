# cli architecture

The `cyberismo` command-line adapter (Commander). It parses arguments, opens a
project through `@cyberismo/data-handler`, calls the `Workspace` API and prints
the result. It also hosts the backend (`app`, `export`, `preview`). It holds no
project rules; those live in data-handler.

## Structure

| Folder / file     | What it is                                                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `commands/`       | One file per top-level verb: a `registerX(program)` plus its action.                                                           |
| `lib/`            | CLI plumbing: `program.ts`, `args.ts`, `errors.ts` (`onProject`), `output.ts`, `prompts.ts`, `open.ts`, `user-preferences.ts`. |
| `install-skills/` | Logic behind `install-skills`; `commands/install-skills.ts` is its wrapper.                                                    |
| root files        | `index.ts` builds the program; `options.ts` option types; `update-plan-lines.ts` plan renderer.                                |

## Dependencies

- May use `@cyberismo/data-handler` (root entry, not `utils/*` deep paths), `@cyberismo/model`, `@cyberismo/assets`, and `@cyberismo/backend` for hosting only (`app`, `export`, `preview`).
- Never `@cyberismo/mcp` or `@cyberismo/app`.
- Inside: `commands/` -> `lib/`; `lib/` imports no command; a command does not import another command.
- Enforced: `package.json` workspace dependencies (pnpm resolves only declared packages). The rest is checked in review.

## Key concepts and invariants

- Adapter only: arguments in, Workspace call, output out. No business rules, defaults or orchestration.
- Project access goes through `onProject` and the public Workspace API, never `Checkout` or `state/`.
- Help text is a contract: refresh `test/help.txt` when it changes.
- Adapter tests check mapping (args, Workspace call, printed output, exit code), not domain behaviour.

## Known debt

- Commands import actions from other commands (`app`/`validate`, `create`/`module`); deep imports of data-handler `utils/*` (8 sites).
- Rules in the adapter: `validate.ts`, `module.ts`, `create.ts` reach for data-handler classes and constants (no ticket yet).
