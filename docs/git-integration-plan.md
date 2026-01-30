# Git Integration Implementation Plan

## Overview

Integrate Git branching into the Cyberismo data-handler to enable multi-user editing. Each card edit creates an isolated branch/worktree, with explicit save (commit) and publish (merge) operations.

## Design Decisions

| Decision | Choice |
|----------|--------|
| User Identity | Git config from project repo (`user.name`, `user.email`) |
| Session Scope | Single card per edit session |
| Save Behavior | Explicit save commits to branch |
| Remote Integration | Not yet (local only) |
| Worktree Location | Inside project folder (`.worktrees/`) |
| Conflict Resolution | Last publish wins (overwrites) |

## Architecture

```
project/
├── .git/                              # Git repository
├── .gitignore                         # Updated to ignore .worktrees/
├── .cards/                            # Main branch resources
├── cardRoot/                          # Main branch cards
└── .worktrees/                        # Per-card edit worktrees
    └── edit-{cardKey}-{timestamp}/
        ├── .cards/
        └── cardRoot/
```

**Branch naming convention**: `edit/{cardKey}/{timestamp}`
- Example: `edit/card_abc123/1706612345678`

**Worktree folder naming**: `edit-{cardKey}-{timestamp}`
- Example: `.worktrees/edit-card_abc123-1706612345678/`

---

## Phase 1: Foundation - Git Repository Setup

### Task 1.1: Create GitManager Class

**File**: `tools/data-handler/src/containers/project/git-manager.ts`

Create a class to wrap simple-git operations for project-level Git management:

```typescript
export class GitManager {
  private git: SimpleGit;
  private projectPath: string;

  constructor(projectPath: string);

  // Repository operations
  async init(): Promise<void>;
  async isGitRepo(): Promise<boolean>;
  async getStatus(): Promise<GitStatus>;
  async getCurrentBranch(): Promise<string>;
  async getUserConfig(): Promise<{ name: string; email: string }>;

  // Commit operations
  async add(files: string[]): Promise<void>;
  async commit(message: string): Promise<string>;  // Returns commit hash

  // Branch operations
  async createBranch(name: string): Promise<void>;
  async deleteBranch(name: string): Promise<void>;
  async listBranches(): Promise<string[]>;

  // Worktree operations
  async createWorktree(path: string, branch: string): Promise<void>;
  async removeWorktree(path: string): Promise<void>;
  async listWorktrees(): Promise<WorktreeInfo[]>;

  // Merge operations
  async merge(branch: string, strategy?: 'ours' | 'theirs'): Promise<MergeResult>;
  async abortMerge(): Promise<void>;
}
```

### Task 1.2: Initialize Git on Project Creation

**File**: `tools/data-handler/src/commands/create.ts`

Modify `createProject()` to:
1. Initialize Git repository after creating folder structure
2. Add all initial files to staging
3. Create initial commit with message "Initial project creation"
4. Update `.gitignore` to include `.worktrees/`

```typescript
// In Create.createProject(), after creating cardsConfig.json:
const gitManager = new GitManager(projectPath);
await gitManager.init();
await gitManager.add(['.']);
await gitManager.commit('Initial project creation');
```

**Update `.gitignore`** to include:
```
.worktrees/
```

### Task 1.3: Add Git Status to Project Class

**File**: `tools/data-handler/src/containers/project.ts`

Add methods to expose Git status:

```typescript
class Project {
  private gitManager?: GitManager;

  async getGitStatus(): Promise<GitStatus | null>;
  async isGitRepository(): Promise<boolean>;
}
```

### Task 1.4: Unit Tests for GitManager

**File**: `tools/data-handler/test/git-manager.test.ts`

Test cases:
- Initialize new repository
- Check if path is Git repo
- Get/set user config
- Create and list branches
- Create and remove worktrees
- Commit changes
- Merge branches

---

## Phase 2: Edit Session Infrastructure

### Task 2.1: Define EditSession Types

**File**: `tools/data-handler/src/types/edit-session.ts`

```typescript
export interface EditSession {
  id: string;                    // Unique session identifier
  cardKey: string;               // The card being edited
  branch: string;                // Git branch name
  worktreePath: string;          // Absolute path to worktree
  createdAt: string;             // ISO timestamp
  lastModified: string;          // ISO timestamp of last save
  status: 'active' | 'published' | 'discarded';
}

export interface EditSessionCreate {
  cardKey: string;
}

export interface EditSessionPublishResult {
  success: boolean;
  commitHash?: string;
  conflicts?: string[];          // For future conflict reporting
}
```

### Task 2.2: Create EditSessionManager

**File**: `tools/data-handler/src/containers/edit-session-manager.ts`

```typescript
export class EditSessionManager {
  private gitManager: GitManager;
  private projectPath: string;
  private sessions: Map<string, EditSession>;

  constructor(projectPath: string, gitManager: GitManager);

  // Session lifecycle
  async startSession(cardKey: string): Promise<EditSession>;
  async getSession(sessionId: string): Promise<EditSession | null>;
  async getSessionForCard(cardKey: string): Promise<EditSession | null>;
  async listSessions(): Promise<EditSession[]>;

  // Session operations
  async saveSession(sessionId: string): Promise<string>;  // Commit, return hash
  async publishSession(sessionId: string): Promise<EditSessionPublishResult>;
  async discardSession(sessionId: string): Promise<void>;

  // Cleanup
  async cleanupOrphanedWorktrees(): Promise<void>;

  // Internal
  private generateSessionId(): string;
  private generateBranchName(cardKey: string): string;
  private getWorktreePath(sessionId: string): string;
  private persistSessions(): Promise<void>;
  private loadSessions(): Promise<void>;
}
```

**Session persistence**: Store in `.worktrees/sessions.json`

### Task 2.3: Implement startSession

When starting an edit session:
1. Check if session already exists for this card
2. Generate unique session ID and branch name
3. Create Git branch from current HEAD
4. Create worktree at `.worktrees/edit-{cardKey}-{timestamp}/`
5. Register session in sessions map
6. Persist sessions to disk
7. Return session info

### Task 2.4: Implement saveSession

When saving (explicit commit):
1. Get session by ID
2. Get GitManager for the worktree
3. Stage changed files for the card
4. Commit with message "Edit card {cardKey}"
5. Update session lastModified
6. Return commit hash

### Task 2.5: Implement publishSession

When publishing (merge to main):
1. Get session by ID
2. Ensure session has commits (was saved)
3. Checkout main branch (in main worktree)
4. Merge session branch with "theirs" strategy (last write wins)
5. Delete session branch
6. Remove worktree
7. Update session status to 'published'
8. Return result

### Task 2.6: Implement discardSession

When discarding:
1. Get session by ID
2. Remove worktree (with force if needed)
3. Delete session branch
4. Update session status to 'discarded'
5. Remove from sessions map

### Task 2.7: Unit Tests for EditSessionManager

**File**: `tools/data-handler/test/edit-session-manager.test.ts`

Test cases:
- Start new session creates branch and worktree
- Cannot start duplicate session for same card
- Save commits changes to branch
- Publish merges to main
- Publish with conflicts uses last-write-wins
- Discard removes branch and worktree
- Session persistence survives restart
- Cleanup removes orphaned worktrees

---

## Phase 3: Command Handler Integration

### Task 3.1: Add Edit Session Commands

**File**: `tools/data-handler/src/commands/edit-session.ts` (new)

```typescript
export class EditSessionCmd {
  private sessionManager: EditSessionManager;

  constructor(project: Project);

  async startEditing(cardKey: string): Promise<EditSession>;
  async save(sessionId: string): Promise<string>;
  async publish(sessionId: string): Promise<EditSessionPublishResult>;
  async discard(sessionId: string): Promise<void>;
  async listSessions(): Promise<EditSession[]>;
  async getSession(sessionId: string): Promise<EditSession | null>;
}
```

### Task 3.2: Register in CommandManager

**File**: `tools/data-handler/src/command-manager.ts`

Add `editSessionCmd` to CommandManager:

```typescript
class CommandManager {
  public editSessionCmd: EditSessionCmd;
  // ... existing commands
}
```

### Task 3.3: Modify Edit Command for Session Awareness

**File**: `tools/data-handler/src/commands/edit.ts`

Modify `editCardContent` and `editCardMetadata` to:
1. Check if card has active edit session
2. If session exists, operate on session's worktree Project instance
3. If no session, operate on main Project (existing behavior for backward compatibility)

```typescript
async editCardContent(cardKey: string, content: string, sessionId?: string) {
  if (sessionId) {
    const session = await this.sessionManager.getSession(sessionId);
    const sessionProject = new Project(session.worktreePath);
    await sessionProject.updateCardContent(cardKey, content);
  } else {
    // Existing behavior
    await this.project.updateCardContent(cardKey, content);
  }
}
```

### Task 3.4: Update index.ts Exports

**File**: `tools/data-handler/src/index.ts`

Export new types and classes:
- `EditSession`, `EditSessionCreate`, `EditSessionPublishResult`
- `EditSessionCmd`
- `GitManager`

---

## Phase 4: Backend API

### Task 4.1: Create Git Router

**File**: `tools/backend/src/domain/git/index.ts` (new)

```typescript
const router = new Hono();

// List all edit sessions
router.get('/sessions', async (c) => {
  const sessions = await commands.editSessionCmd.listSessions();
  return c.json(sessions);
});

// Start editing a card
router.post('/sessions', async (c) => {
  const { cardKey } = await c.req.json();
  const session = await commands.editSessionCmd.startEditing(cardKey);
  return c.json(session, 201);
});

// Get session details
router.get('/sessions/:id', async (c) => {
  const session = await commands.editSessionCmd.getSession(c.req.param('id'));
  if (!session) return c.json({ error: 'Session not found' }, 404);
  return c.json(session);
});

// Save (commit) session
router.post('/sessions/:id/save', async (c) => {
  const commitHash = await commands.editSessionCmd.save(c.req.param('id'));
  return c.json({ commitHash });
});

// Publish (merge) session
router.post('/sessions/:id/publish', async (c) => {
  const result = await commands.editSessionCmd.publish(c.req.param('id'));
  return c.json(result);
});

// Discard session
router.delete('/sessions/:id', async (c) => {
  await commands.editSessionCmd.discard(c.req.param('id'));
  return c.json({ success: true });
});

export default router;
```

### Task 4.2: Register Git Router

**File**: `tools/backend/src/routes.ts`

Add git router to main app:

```typescript
import gitRouter from './domain/git';
app.route('/api/git', gitRouter);
```

### Task 4.3: Modify Cards Router for Session Support

**File**: `tools/backend/src/domain/cards/index.ts`

Update PATCH endpoint to accept optional `sessionId`:

```typescript
router.patch('/:key', async (c) => {
  const { sessionId, ...updates } = await c.req.json();
  await cardService.updateCard(commands, key, updates, sessionId);
  // ...
});
```

### Task 4.4: Update Card Service

**File**: `tools/backend/src/domain/cards/service.ts`

Pass sessionId through to edit commands:

```typescript
export async function updateCard(
  commands: CommandManager,
  key: string,
  updates: CardUpdate,
  sessionId?: string
) {
  if (updates.content !== undefined) {
    await commands.editCmd.editCardContent(key, updates.content, sessionId);
  }
  // ... similar for metadata
}
```

### Task 4.5: API Integration Tests

**File**: `tools/backend/test/git-api.test.ts` (new)

Test cases:
- POST /api/git/sessions creates session
- GET /api/git/sessions lists sessions
- POST /api/git/sessions/:id/save commits changes
- POST /api/git/sessions/:id/publish merges to main
- DELETE /api/git/sessions/:id discards session
- PATCH /api/cards/:key with sessionId edits in session

---

## Phase 5: CLI Integration

### Task 5.1: Add Edit Session CLI Commands

**File**: `tools/cli/src/commands/edit-session.ts` (new)

```bash
# Start editing a card
cyberismo edit start <cardKey>

# Save current changes
cyberismo edit save <sessionId>

# Publish changes to main
cyberismo edit publish <sessionId>

# Discard changes
cyberismo edit discard <sessionId>

# List active sessions
cyberismo edit list
```

### Task 5.2: Register CLI Commands

**File**: `tools/cli/src/commands/index.ts`

Register edit-session commands.

---

## Phase 6: Frontend Integration (Future)

### Task 6.1: Edit Session API Client

**File**: `tools/app/src/lib/api/git.ts` (new)

```typescript
export function useEditSessions() { ... }
export function useStartEditSession() { ... }
export function useSaveSession() { ... }
export function usePublishSession() { ... }
export function useDiscardSession() { ... }
```

### Task 6.2: Edit Mode UI State

**File**: `tools/app/src/lib/slices/editSessionSlice.ts` (new)

Redux slice for tracking current edit session.

### Task 6.3: Card Editor Integration

Modify CardEditor to:
1. Start session when entering edit mode
2. Show "Save" and "Publish" buttons
3. Track unsaved changes
4. Confirm before discarding

---

## Implementation Order

### Milestone 1: Core Infrastructure
1. Task 1.1: GitManager class
2. Task 1.4: GitManager tests
3. Task 1.2: Git init on project creation
4. Task 1.3: Git status in Project

### Milestone 2: Edit Sessions
5. Task 2.1: EditSession types
6. Task 2.2: EditSessionManager class
7. Task 2.3-2.6: Session operations
8. Task 2.7: EditSessionManager tests

### Milestone 3: Command Integration
9. Task 3.1: EditSessionCmd
10. Task 3.2: Register in CommandManager
11. Task 3.3: Session-aware Edit command
12. Task 3.4: Export updates

### Milestone 4: API
13. Task 4.1: Git router
14. Task 4.2: Register router
15. Task 4.3-4.4: Cards router updates
16. Task 4.5: API tests

### Milestone 5: CLI
17. Task 5.1-5.2: CLI commands

### Milestone 6: Frontend (Future)
18. Tasks 6.1-6.3: Frontend integration

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Worktree creation fails | Graceful error handling, cleanup partial state |
| Orphaned worktrees | Cleanup on startup, periodic cleanup job |
| Merge fails unexpectedly | Force merge with "theirs" strategy, log conflicts |
| Disk space from many worktrees | Monitor worktree count, warn at threshold |
| Git lock files | Retry logic, lock file cleanup |

---

## Testing Strategy

1. **Unit tests**: GitManager, EditSessionManager (mocked Git)
2. **Integration tests**: Full flow with real Git operations
3. **E2E tests**: API endpoints with real project
4. **Manual testing**: Multi-terminal concurrent editing

---

## Success Criteria

- [ ] New projects are Git repositories
- [ ] Can start edit session for a card
- [ ] Edits in session are isolated from main
- [ ] Can save (commit) changes explicitly
- [ ] Can publish (merge) to main
- [ ] Can discard session
- [ ] Multiple concurrent sessions work
- [ ] Last publish wins on conflicts
- [ ] All existing tests pass
- [ ] New tests for Git functionality pass
