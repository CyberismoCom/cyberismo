<!-- Maintenance: this file is a self-contained summary of CLAUDE.md.
     When updating rules, change CLAUDE.md first, then update this file to match.
     Keep this under ~100 lines so it fits in the Copilot system-prompt budget. -->

# Copilot Instructions for Cyberismo

**Read `CLAUDE.md` in the repository root** for full architecture, test templates, and detailed patterns. Everything below is a self-contained summary of what breaks builds most often.

## Rules That Break Builds

1. **pnpm only** — never `npm` or `yarn`.
2. **`.js` in every relative import** — even though source files are `.ts`:
   ```typescript
   // CORRECT
   import { Project } from './containers/project.js';
   // WRONG — runtime crash
   import { Project } from './containers/project';
   ```
3. **`import type`** for type-only imports — ESLint error otherwise:
   ```typescript
   // CORRECT
   import type { Card } from '../interfaces/project-interfaces.js';
   // WRONG
   import { Card } from '../interfaces/project-interfaces.js'; // Card only used as a type
   ```
4. **`node:` prefix** on Node built-ins: `import { join } from 'node:path'`.
5. **Workspace imports by package name**, not relative paths: `import { CommandManager } from '@cyberismo/data-handler'`.
6. **`await` every promise** in data-handler, backend, cli — `no-floating-promises` is enforced.
7. **Single quotes** (Prettier) — run `pnpm prettier-fix` if unsure.

## License Header

Every new `.ts` / `.tsx` file **must** begin with:

```typescript
/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2026

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/
```

## Test Before Code

- Write a failing test first. Fix bugs by reproducing them in a test first.
- Copy test fixtures to a temp dir; never mutate `test/test-data/`.
- Never commit `.only` on tests.

**Assertion styles per package — do not mix:**

| Package | Framework | Assertion style |
|---|---|---|
| data-handler, cli | Mocha + Chai | `expect(x).to.equal(y)` |
| backend, mcp | Vitest | `expect(x).toBe(y)`, test via `app.request()` |
| app | Vitest + Testing Library | `expect(x).toBe(y)` |

## Verify

```bash
pnpm --filter <package> build   # Build first (especially data-handler)
pnpm test-<package>             # Run tests
pnpm --filter <package> lint    # Lint
pnpm prettier-check             # Format check
```

## Don't

- Use `any` without a justifying comment.
- Swallow errors silently — use `errorFunction()` from `utils/error-utils.ts`.
- Add dependencies without discussion.
- Mix unrelated changes.
- Use `console.log` in data-handler source — use `getChildLogger()`.

