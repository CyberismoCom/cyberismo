# Migration System — HTTP Routes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose the mutation engine and module-update flow over HTTP for the React frontend. Three route groups: `/api/projects/:prefix/mutations/preview` (read-only inspection), `/api/projects/:prefix/mutations/apply` (transactional, `409 Conflict` on stale fingerprint), and `/api/projects/:prefix/modules/update` (long-running, SSE-streamed). Error responses carry a `code` discriminator so the frontend can branch without parsing prose.

**Architecture:** New `tools/backend/src/domain/mutations/` and `tools/backend/src/domain/modules/` folders, each with `index.ts` (Hono router), `schema.ts` (Zod request/response shapes), `service.ts` (delegates to `data-handler` command classes). Routes are mounted on the existing project-scoped router so they inherit Keycloak auth and `runWithCommands` middleware. SSE for the module-update progress channel reuses the pattern in `tools/backend/src/domain/cards/index.ts:876` (`streamSSE` from `hono/streaming`).

**Tech Stack:** TypeScript, Hono, Zod (`@hono/zod-validator`), Vitest, the existing `@cyberismo/data-handler` exports (`ResourceMutations`, `ModuleUpdate`).

---

## Scope

**Prerequisites:**
- Plan 1 (foundation): `ResourceMutations.plan()/apply()` exported.
- Plans 2-5: per-resource handlers registered.
- Plan 6: `ModuleUpdate.preview()/apply()` exported.

**In scope:**
- `POST /api/projects/:prefix/mutations/preview` — wraps `ResourceMutations.plan()`. Returns `{ isBreaking, preview, fingerprint }`.
- `POST /api/projects/:prefix/mutations/apply` — wraps `ResourceMutations.apply()`. Accepts `{ input, fingerprint }`. Returns 200 on success, **409 Conflict** with `{ code: 'stale_fingerprint', preview: PreviewResult }` on fingerprint mismatch.
- `POST /api/projects/:prefix/modules/update/preview` — wraps `ModuleUpdate.preview()`. Returns the `ModuleUpdatePreview`.
- `POST /api/projects/:prefix/modules/update` — wraps `ModuleUpdate.apply()`. Returns an SSE stream. Events: `step.started`, `step.completed`, `step.failed`, `complete`, `error`.
- Error model — every non-2xx response includes `{ code: string, message: string, details?: ... }`. Codes: `stale_fingerprint`, `cascade_failed`, `update_conflict`, `project_requires_migration` (reserved for later), `validation_error`, `not_found`.
- Auth — all routes require Admin role via the existing `requireRole(UserRole.Admin)` pattern (`tools/backend/src/domain/project/index.ts:47`).

**Out of scope:**
- The frontend (`tools/app/`) using these routes — that's a separate React plan.
- WebSocket-based progress (SSE is sufficient for fire-once update flows).
- Multi-project endpoints; everything is project-scoped via the existing `:prefix` routing.

---

## File structure

**New files:**
- `tools/backend/src/domain/mutations/index.ts` — Hono router.
- `tools/backend/src/domain/mutations/schema.ts` — Zod request/response schemas.
- `tools/backend/src/domain/mutations/service.ts` — delegate to `ResourceMutations`.
- `tools/backend/src/domain/modules/index.ts` — Hono router for module update.
- `tools/backend/src/domain/modules/schema.ts`.
- `tools/backend/src/domain/modules/service.ts`.
- `tools/backend/src/common/errors.ts` — shared error builder for the `code` discriminator (or extend the existing error util).
- `tools/backend/test/domain/mutations/index.test.ts`.
- `tools/backend/test/domain/modules/index.test.ts`.

**Modified files:**
- `tools/backend/src/app.ts` — mount the two new routers.
- `tools/backend/src/utils.ts` (or wherever `toolResult`/`toolError` lives) — add `code` field.

---

## Tasks

### Task 1: Error-response shape with `code` discriminator

**Files:**
- Create or modify: `tools/backend/src/common/errors.ts`

The existing error helpers return `{ reason: string }` — frontends parse prose to branch. Add a typed error envelope so 409s and other distinguishable cases are switchable.

- [ ] **Step 1: Inspect the current error helper**

```bash
grep -rn "reason:" tools/backend/src/ | head -10
grep -rn "throw new" tools/backend/src/domain/ | head -10
```

Note the existing pattern (likely a `c.json({ reason }, 400)` or similar).

- [ ] **Step 2: Write a small failing test**

```typescript
// tools/backend/test/common/errors.test.ts

import { describe, it, expect } from 'vitest';
import { errorResponse } from '../../src/common/errors.js';

describe('errorResponse', () => {
  it('returns code, message, and details', () => {
    const body = errorResponse({
      code: 'stale_fingerprint',
      message: 'Plan is stale',
      details: { freshPreview: { foo: 1 } },
    });
    expect(body.code).toBe('stale_fingerprint');
    expect(body.details.freshPreview.foo).toBe(1);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd tools/backend && pnpm test test/common/errors.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

```typescript
// tools/backend/src/common/errors.ts

export type ErrorCode =
  | 'stale_fingerprint'
  | 'cascade_failed'
  | 'update_conflict'
  | 'project_requires_migration'  // reserved
  | 'validation_error'
  | 'not_found';

export interface ErrorResponse {
  code: ErrorCode;
  message: string;
  details?: unknown;
}

export function errorResponse(payload: {
  code: ErrorCode;
  message: string;
  details?: unknown;
}): ErrorResponse {
  return payload;
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd tools/backend && pnpm test test/common/errors.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tools/backend/src/common/errors.ts \
        tools/backend/test/common/errors.test.ts
git commit -m "feat: typed error envelope with code discriminator"
```

---

### Task 2: Mutations schema (Zod)

**Files:**
- Create: `tools/backend/src/domain/mutations/schema.ts`

Type-safe request/response shapes for the preview and apply endpoints. Mirrors the `data-handler` `MutationInput` / `PreviewResult` types but in Zod.

- [ ] **Step 1: Create the file**

```typescript
// tools/backend/src/domain/mutations/schema.ts

import { z } from 'zod';

const ResourceNameSchema = z.object({
  prefix: z.string(),
  type: z.string(),
  identifier: z.string(),
});

const OperationSchema = z.object({
  name: z.enum(['add', 'change', 'rank', 'remove']),
  target: z.unknown().optional(),
  to: z.unknown().optional(),
  newIndex: z.number().optional(),
  replacementValue: z.unknown().optional(),
  mappingTable: z
    .object({ stateMapping: z.record(z.string()) })
    .optional(),
});

const UpdateKeySchema = z.object({
  key: z.string(),
  subKey: z.string().optional(),
});

export const MutationInputSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('edit'),
    target: ResourceNameSchema,
    updateKey: UpdateKeySchema,
    operation: OperationSchema,
  }),
  z.object({ kind: z.literal('delete'), target: ResourceNameSchema }),
  z.object({
    kind: z.literal('rename'),
    target: ResourceNameSchema,
    newIdentifier: z.string(),
  }),
  z.object({ kind: z.literal('project_rename'), newPrefix: z.string() }),
]);

export const FingerprintSchema = z.object({ digest: z.string() });

export const PreviewRequestSchema = z.object({
  input: MutationInputSchema,
});

export const ApplyRequestSchema = z.object({
  input: MutationInputSchema,
  fingerprint: FingerprintSchema.optional(),
});

export const CascadePreviewSchema = z.object({
  affectedCardCount: z.number(),
  affectedLinkCount: z.number(),
  affectedCalculationCount: z.number(),
  affectedHandlebarFileCount: z.number(),
  dataLossExpected: z.boolean(),
  summary: z.string(),
});

export const PreviewResultSchema = z.object({
  input: MutationInputSchema,
  isBreaking: z.boolean(),
  preview: CascadePreviewSchema,
  fingerprint: FingerprintSchema,
});
```

- [ ] **Step 2: Build**

```bash
cd tools/backend && pnpm build
```

Expected: success.

- [ ] **Step 3: Commit**

```bash
git add tools/backend/src/domain/mutations/schema.ts
git commit -m "feat: Zod schemas for mutation endpoints"
```

---

### Task 3: Mutations service — bridge to `data-handler`

**Files:**
- Create: `tools/backend/src/domain/mutations/service.ts`

A thin async wrapper around `ResourceMutations` that the Hono router can call without worrying about the data-handler API surface.

- [ ] **Step 1: Create the file**

```typescript
// tools/backend/src/domain/mutations/service.ts

import { ResourceMutations } from '@cyberismo/data-handler';
import type {
  MutationInput,
  MutationFingerprint,
  PreviewResult,
  ApplyResult,
} from '@cyberismo/data-handler/types';
import type { CommandManager } from '@cyberismo/data-handler';

export async function previewMutation(
  commands: CommandManager,
  input: MutationInput,
): Promise<PreviewResult> {
  const mutations = new ResourceMutations(commands.project);
  return mutations.plan(input);
}

export async function applyMutation(
  commands: CommandManager,
  input: MutationInput,
  fingerprint?: MutationFingerprint,
): Promise<ApplyResult> {
  const mutations = new ResourceMutations(commands.project);
  return mutations.apply(input, { fingerprint });
}
```

(Adjust the `@cyberismo/data-handler` import paths to match its exported entry points; check the existing backend domain files for the import idiom.)

- [ ] **Step 2: Build**

```bash
cd tools/backend && pnpm build
```

Expected: success.

- [ ] **Step 3: Commit**

```bash
git add tools/backend/src/domain/mutations/service.ts
git commit -m "feat: mutations service wraps data-handler ResourceMutations"
```

---

### Task 4: Mutations router — `POST /mutations/preview`

**Files:**
- Create: `tools/backend/src/domain/mutations/index.ts`
- Test: `tools/backend/test/domain/mutations/index.test.ts`

The preview route. Read-only, no side effects, no fingerprint validation needed.

- [ ] **Step 1: Write the failing test**

```typescript
// tools/backend/test/domain/mutations/index.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { buildApp } from '../../../src/app.js';
import { copyDir } from '@cyberismo/data-handler/utils/file-utils';

const FIXTURE_PATH = join(import.meta.dirname, '..', '..', '..', '..', 'data-handler', 'test', 'test-data', 'decision-records');
const tmpDir = join(import.meta.dirname, 'tmp-mutations-http');

describe('POST /api/projects/:prefix/mutations/preview', () => {
  let projectPath: string;
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    projectPath = join(tmpDir, `proj-${Date.now()}`);
    await mkdir(projectPath, { recursive: true });
    await copyDir(FIXTURE_PATH, projectPath);
    app = buildApp({ projectRoot: projectPath /* whatever buildApp needs */ });
  });
  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns isBreaking, preview, and fingerprint', async () => {
    const res = await app.request('/api/projects/test/mutations/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' /* + auth */ },
      body: JSON.stringify({
        input: {
          kind: 'rename',
          target: { prefix: 'test', type: 'linkTypes', identifier: 'causes' },
          newIdentifier: 'is-caused-by',
        },
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.isBreaking).toBe(true);
    expect(body.fingerprint.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(body.preview.affectedLinkCount).toBeGreaterThan(0);
  });

  it('returns 400 with validation_error on malformed input', async () => {
    const res = await app.request('/api/projects/test/mutations/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' /* + auth */ },
      body: JSON.stringify({ input: { kind: 'unknown' } }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('validation_error');
  });
});
```

(Auth setup: check `tools/backend/test/` for the test-auth pattern. There's likely a mock auth provider.)

- [ ] **Step 2: Run test to verify it fails**

```bash
cd tools/backend && pnpm test test/domain/mutations/index.test.ts
```

Expected: FAIL — router not mounted.

- [ ] **Step 3: Create the router**

```typescript
// tools/backend/src/domain/mutations/index.ts

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';

import { previewMutation } from './service.js';
import { PreviewRequestSchema } from './schema.js';
import { requireRole, UserRole } from '../../middleware/auth.js';
import { errorResponse } from '../../common/errors.js';

export const mutations = new Hono();

mutations.post(
  '/preview',
  requireRole(UserRole.Admin),
  zValidator('json', PreviewRequestSchema, (result, c) => {
    if (!result.success) {
      return c.json(
        errorResponse({
          code: 'validation_error',
          message: 'Invalid request body',
          details: result.error.format(),
        }),
        400,
      );
    }
  }),
  async (c) => {
    const { input } = c.req.valid('json');
    const commands = c.get('commands');
    try {
      const result = await previewMutation(commands, input);
      return c.json(result);
    } catch (err) {
      return c.json(
        errorResponse({
          code: 'validation_error',
          message: (err as Error).message,
        }),
        400,
      );
    }
  },
);
```

- [ ] **Step 4: Mount the router in `app.ts`**

In `tools/backend/src/app.ts`, near the existing project-scoped router mounts:

```typescript
import { mutations } from './domain/mutations/index.js';
// ...
projectRouter.route('/mutations', mutations);
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd tools/backend && pnpm test test/domain/mutations/index.test.ts
```

Expected: PASS for both tests.

- [ ] **Step 6: Commit**

```bash
git add tools/backend/src/domain/mutations/index.ts \
        tools/backend/src/app.ts \
        tools/backend/test/domain/mutations/index.test.ts
git commit -m "feat: POST /api/projects/:prefix/mutations/preview"
```

---

### Task 5: Mutations router — `POST /mutations/apply` with 409 on stale fingerprint

**Files:**
- Modify: `tools/backend/src/domain/mutations/index.ts`
- Test: extend `tools/backend/test/domain/mutations/index.test.ts`

Apply is the destructive route. On a fingerprint mismatch the service throws; the router catches and returns 409 with a fresh PreviewResult so the frontend can re-render without a second roundtrip.

- [ ] **Step 1: Write the failing test**

Append to `index.test.ts`:

```typescript
it('returns 200 on successful apply', async () => {
  // First preview to get a fingerprint.
  const previewRes = await app.request('/api/projects/test/mutations/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: {
        kind: 'rename',
        target: { prefix: 'test', type: 'linkTypes', identifier: 'causes' },
        newIdentifier: 'is-caused-by',
      },
    }),
  });
  const preview = await previewRes.json();

  const applyRes = await app.request('/api/projects/test/mutations/apply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: preview.input,
      fingerprint: preview.fingerprint,
    }),
  });
  expect(applyRes.status).toBe(200);
});

it('returns 409 with fresh preview when fingerprint is stale', async () => {
  const applyRes = await app.request('/api/projects/test/mutations/apply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: {
        kind: 'rename',
        target: { prefix: 'test', type: 'linkTypes', identifier: 'causes' },
        newIdentifier: 'is-caused-by',
      },
      fingerprint: { digest: 'deadbeef'.repeat(8) },  // intentionally wrong
    }),
  });
  expect(applyRes.status).toBe(409);
  const body = await applyRes.json();
  expect(body.code).toBe('stale_fingerprint');
  expect(body.details.preview.fingerprint.digest).not.toBe('deadbeef'.repeat(8));
});
```

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL — route not implemented.

- [ ] **Step 3: Add the apply route**

```typescript
// In tools/backend/src/domain/mutations/index.ts

import { applyMutation, previewMutation } from './service.js';
import { ApplyRequestSchema } from './schema.js';

mutations.post(
  '/apply',
  requireRole(UserRole.Admin),
  zValidator('json', ApplyRequestSchema, (result, c) => {
    if (!result.success) {
      return c.json(
        errorResponse({
          code: 'validation_error',
          message: 'Invalid request body',
          details: result.error.format(),
        }),
        400,
      );
    }
  }),
  async (c) => {
    const { input, fingerprint } = c.req.valid('json');
    const commands = c.get('commands');
    try {
      const result = await applyMutation(commands, input, fingerprint);
      return c.json(result);
    } catch (err) {
      const message = (err as Error).message;
      if (/stale fingerprint/i.test(message)) {
        // Compute a fresh preview for the client to re-render.
        const fresh = await previewMutation(commands, input);
        return c.json(
          errorResponse({
            code: 'stale_fingerprint',
            message: 'Project state changed since preview; re-confirm.',
            details: { preview: fresh },
          }),
          409,
        );
      }
      return c.json(
        errorResponse({ code: 'cascade_failed', message }),
        400,
      );
    }
  },
);
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd tools/backend && pnpm test test/domain/mutations/index.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/backend/src/domain/mutations/index.ts \
        tools/backend/test/domain/mutations/index.test.ts
git commit -m "feat: POST /mutations/apply with 409 on stale fingerprint

Returns a fresh PreviewResult in details.preview so the frontend can
re-render the confirmation modal without a second HTTP roundtrip."
```

---

### Task 6: Modules schema

**Files:**
- Create: `tools/backend/src/domain/modules/schema.ts`

Zod schemas mirroring `ModuleUpdatePreview` and `ModuleUpdateResult`.

- [ ] **Step 1: Create the file**

```typescript
// tools/backend/src/domain/modules/schema.ts

import { z } from 'zod';

export const PreviewUpdateRequestSchema = z.object({
  module: z.string(),
  toVersion: z.string(),
});

export const ApplyUpdateRequestSchema = z.object({
  module: z.string(),
  toVersion: z.string(),
});

const ReplayConflictSchema = z.object({
  kind: z.enum([
    'local_reference_unrewritable',
    'migration_path_unreachable',
    'other',
  ]),
  affected: z.string(),
  location: z.string(),
  description: z.string(),
  suggestedTargetVersion: z.string().optional(),
  suggestedIntermediateVersions: z.array(z.string()),
});

const ResolvedUpdateStepSchema = z.object({
  order: z.number(),
  modulePrefix: z.string(),
  fromVersion: z.string().nullable(),
  toVersion: z.string(),
  logChain: z.array(z.string()),
  crossesMajorBoundary: z.boolean(),
});

export const ModuleUpdatePreviewSchema = z.object({
  steps: z.array(ResolvedUpdateStepSchema),
  conflicts: z.array(ReplayConflictSchema),
  totalEntryCount: z.number(),
  affectedCardCount: z.number(),
  dataLossExpected: z.boolean(),
});
```

- [ ] **Step 2: Build**

```bash
cd tools/backend && pnpm build
```

Expected: success.

- [ ] **Step 3: Commit**

```bash
git add tools/backend/src/domain/modules/schema.ts
git commit -m "feat: Zod schemas for module-update endpoints"
```

---

### Task 7: Modules service

**Files:**
- Create: `tools/backend/src/domain/modules/service.ts`

Thin wrapper around the data-handler `ModuleUpdate` class.

- [ ] **Step 1: Create the file**

```typescript
// tools/backend/src/domain/modules/service.ts

import { ModuleUpdate } from '@cyberismo/data-handler';
import type { CommandManager } from '@cyberismo/data-handler';
import type {
  ModuleUpdatePreview,
  ModuleUpdateResult,
} from '@cyberismo/data-handler/types';

export async function previewModuleUpdate(
  commands: CommandManager,
  modulePrefix: string,
  toVersion: string,
): Promise<ModuleUpdatePreview> {
  const updater = new ModuleUpdate(commands.project);
  return updater.preview(modulePrefix, toVersion);
}

export async function applyModuleUpdate(
  commands: CommandManager,
  preview: ModuleUpdatePreview,
): Promise<ModuleUpdateResult> {
  const updater = new ModuleUpdate(commands.project);
  return updater.apply(preview);
}
```

- [ ] **Step 2: Build**

```bash
cd tools/backend && pnpm build
```

Expected: success.

- [ ] **Step 3: Commit**

```bash
git add tools/backend/src/domain/modules/service.ts
git commit -m "feat: modules service wraps data-handler ModuleUpdate"
```

---

### Task 8: Modules router — `POST /modules/update/preview`

**Files:**
- Create: `tools/backend/src/domain/modules/index.ts`
- Test: `tools/backend/test/domain/modules/index.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tools/backend/test/domain/modules/index.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { buildApp } from '../../../src/app.js';
import { copyDir } from '@cyberismo/data-handler/utils/file-utils';

// Use the module-update-fixture created in Plan 6's Task 12.
const FIXTURE_PATH = join(import.meta.dirname, '..', '..', '..', '..', 'data-handler', 'test', 'test-data', 'module-update-fixture');
const tmpDir = join(import.meta.dirname, 'tmp-modules-http');

describe('POST /api/projects/:prefix/modules/update/preview', () => {
  let projectPath: string;
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    projectPath = join(tmpDir, `proj-${Date.now()}`);
    await mkdir(projectPath, { recursive: true });
    await copyDir(FIXTURE_PATH, projectPath);
    app = buildApp({ projectRoot: projectPath });
  });
  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns the preview with steps and no conflicts', async () => {
    const res = await app.request('/api/projects/test/modules/update/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ module: 'shared/foo', toVersion: '1.6.0' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.steps).toHaveLength(1);
    expect(body.conflicts).toHaveLength(0);
  });

  it('returns 200 with conflicts populated when the path is unreachable', async () => {
    // Adjust fixture so appliedModules has shared/foo at 1.6.0 (diverged branch case).
    // The body should still be 200 (preview is read-only); apply would refuse.
    const res = await app.request('/api/projects/test/modules/update/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ module: 'shared/foo', toVersion: '2.0.0' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.conflicts.length).toBeGreaterThan(0);
    expect(body.conflicts[0].kind).toBe('migration_path_unreachable');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd tools/backend && pnpm test test/domain/modules/index.test.ts
```

Expected: FAIL — router not mounted.

- [ ] **Step 3: Create the router with the preview route**

```typescript
// tools/backend/src/domain/modules/index.ts

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';

import { previewModuleUpdate } from './service.js';
import { PreviewUpdateRequestSchema } from './schema.js';
import { requireRole, UserRole } from '../../middleware/auth.js';
import { errorResponse } from '../../common/errors.js';

export const modules = new Hono();

modules.post(
  '/update/preview',
  requireRole(UserRole.Admin),
  zValidator('json', PreviewUpdateRequestSchema, (result, c) => {
    if (!result.success) {
      return c.json(
        errorResponse({
          code: 'validation_error',
          message: 'Invalid request body',
          details: result.error.format(),
        }),
        400,
      );
    }
  }),
  async (c) => {
    const { module, toVersion } = c.req.valid('json');
    const commands = c.get('commands');
    try {
      const preview = await previewModuleUpdate(commands, module, toVersion);
      return c.json(preview);
    } catch (err) {
      return c.json(
        errorResponse({
          code: 'validation_error',
          message: (err as Error).message,
        }),
        400,
      );
    }
  },
);
```

- [ ] **Step 4: Mount in app.ts**

```typescript
import { modules } from './domain/modules/index.js';
projectRouter.route('/modules', modules);
```

- [ ] **Step 5: Run tests**

```bash
cd tools/backend && pnpm test test/domain/modules/index.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tools/backend/src/domain/modules/index.ts \
        tools/backend/src/app.ts \
        tools/backend/test/domain/modules/index.test.ts
git commit -m "feat: POST /modules/update/preview"
```

---

### Task 9: Modules router — `POST /modules/update` with SSE

**Files:**
- Modify: `tools/backend/src/domain/modules/index.ts`
- Test: extend `tools/backend/test/domain/modules/index.test.ts`

The destructive route. Streams progress events. The implementation calls `applyModuleUpdate` and yields events per step. Reference SSE pattern: `tools/backend/src/domain/cards/index.ts:876` (`streamSSE` from `hono/streaming`).

- [ ] **Step 1: Write the failing test**

```typescript
it('streams progress events and completes', async () => {
  const res = await app.request('/api/projects/test/modules/update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ module: 'shared/foo', toVersion: '1.6.0' }),
  });
  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toMatch(/text\/event-stream/);

  // Consume the stream.
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let payload = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    payload += decoder.decode(value);
  }

  // SSE format: "event: <name>\ndata: <json>\n\n"
  expect(payload).toMatch(/event: step\.started/);
  expect(payload).toMatch(/event: step\.completed/);
  expect(payload).toMatch(/event: complete/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL — route not implemented.

- [ ] **Step 3: Implement the SSE route**

```typescript
// In tools/backend/src/domain/modules/index.ts

import { streamSSE } from 'hono/streaming';
import { applyModuleUpdate, previewModuleUpdate } from './service.js';
import { ApplyUpdateRequestSchema } from './schema.js';

modules.post(
  '/update',
  requireRole(UserRole.Admin),
  zValidator('json', ApplyUpdateRequestSchema, (result, c) => {
    if (!result.success) {
      return c.json(
        errorResponse({
          code: 'validation_error',
          message: 'Invalid request body',
          details: result.error.format(),
        }),
        400,
      );
    }
  }),
  async (c) => {
    const { module: modulePrefix, toVersion } = c.req.valid('json');
    const commands = c.get('commands');

    return streamSSE(c, async (stream) => {
      try {
        const preview = await previewModuleUpdate(commands, modulePrefix, toVersion);
        if (preview.conflicts.length > 0) {
          await stream.writeSSE({
            event: 'error',
            data: JSON.stringify(
              errorResponse({
                code: 'update_conflict',
                message: 'Conflicts detected; cannot apply.',
                details: { conflicts: preview.conflicts },
              }),
            ),
          });
          return;
        }

        // Emit step.started for each step before applying.
        for (const step of preview.steps) {
          await stream.writeSSE({
            event: 'step.started',
            data: JSON.stringify(step),
          });
        }

        const result = await applyModuleUpdate(commands, preview);

        // Emit step.completed / step.failed per result.
        for (const stepResult of result.steps) {
          await stream.writeSSE({
            event: stepResult.status === 'succeeded' ? 'step.completed' : 'step.failed',
            data: JSON.stringify(stepResult),
          });
        }

        if (result.status === 'succeeded') {
          await stream.writeSSE({
            event: 'complete',
            data: JSON.stringify(result),
          });
        } else {
          await stream.writeSSE({
            event: 'error',
            data: JSON.stringify(
              errorResponse({
                code: 'cascade_failed',
                message: result.failureSummary ?? 'Update failed.',
                details: { result },
              }),
            ),
          });
        }
      } catch (err) {
        await stream.writeSSE({
          event: 'error',
          data: JSON.stringify(
            errorResponse({
              code: 'cascade_failed',
              message: (err as Error).message,
            }),
          ),
        });
      }
    });
  },
);
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd tools/backend && pnpm test test/domain/modules/index.test.ts
```

Expected: PASS for both tests.

- [ ] **Step 5: Commit**

```bash
git add tools/backend/src/domain/modules/index.ts \
        tools/backend/test/domain/modules/index.test.ts
git commit -m "feat: POST /modules/update with SSE progress stream

Events: step.started, step.completed, step.failed, complete, error.
On conflict the route emits an 'error' event with code=update_conflict
without ever advancing any installation."
```

---

### Task 10: Smoke test with curl against a running backend

**Files:**
- Documentation only.

A documented smoke-test sequence the implementer can run to verify the routes end-to-end against a live project.

- [ ] **Step 1: Document the sequence in `tools/backend/README.md`**

If `tools/backend/README.md` exists, append a section. If not, create it.

```markdown
## Manual smoke test: migration system routes

```bash
# 1. Start the backend (with a real project mounted).
pnpm --filter @cyberismo/backend dev

# 2. In another terminal, get an auth token (depends on your dev auth setup).
TOKEN=...

# 3. Preview a mutation.
curl -X POST http://localhost:3000/api/projects/test/mutations/preview \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"input":{"kind":"rename","target":{"prefix":"test","type":"linkTypes","identifier":"causes"},"newIdentifier":"is-caused-by"}}'

# Capture the fingerprint from the response.

# 4. Apply with the fingerprint.
curl -X POST http://localhost:3000/api/projects/test/mutations/apply \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --argjson preview "$(cat /tmp/preview.json)" '{input: $preview.input, fingerprint: $preview.fingerprint}')"

# 5. Module update with SSE.
curl -N -X POST http://localhost:3000/api/projects/test/modules/update \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"module":"shared/foo","toVersion":"1.6.0"}'
# Should stream:
#   event: step.started
#   data: ...
#   event: step.completed
#   data: ...
#   event: complete
#   data: ...
```
```

- [ ] **Step 2: Commit**

```bash
git add tools/backend/README.md
git commit -m "docs: smoke-test commands for migration system routes"
```

---

## Verification checklist after the plan executes

```bash
pnpm --filter @cyberismo/backend test
pnpm --filter @cyberismo/backend build
pnpm --filter @cyberismo/backend lint
pnpm test
```

All should pass. Smoke-test against a running backend per Task 10.

---

## What this plan delivers

- `POST /api/projects/:prefix/mutations/preview` — read-only preview with fingerprint.
- `POST /api/projects/:prefix/mutations/apply` — apply with fingerprint round-trip; 409 with fresh preview on stale fingerprint.
- `POST /api/projects/:prefix/modules/update/preview` — module-update preview with steps and conflicts.
- `POST /api/projects/:prefix/modules/update` — SSE-streamed apply with per-step progress events.
- Typed error envelope with a `code` discriminator (`stale_fingerprint`, `cascade_failed`, `update_conflict`, `validation_error`, `not_found`).
- All routes Admin-gated via the existing Keycloak middleware.

## What's next

- React frontend integration: the `tools/app/` codebase needs to call these routes from the existing SWR + Redux pattern. The 409 handling, SSE consumption, and preview-modal UX all live there. That's a separate plan, owned by the frontend team.
- Optional: a project-status endpoint that reports whether any `ModuleInstallation` is out of sync (would land alongside the deferred `project_requires_migration` error code).
- Optional: rate-limiting on the preview endpoint (preview is cheap but a malicious client could spam it).
