// tools/data-handler/src/mutations/handler.ts

import type { Project } from '../containers/project.js';
import type {
  CascadePreview,
  MutationInput,
} from './types.js';

export interface MutationContext {
  project: Project;
  input: MutationInput;
}

export interface Handler {
  /** True when this handler matches the input's (kind, target, key, operation) tuple. */
  matches(ctx: MutationContext): boolean;

  /** Whether matching inputs are classified as breaking changes. */
  readonly isBreaking: boolean;

  /** Compute the cascade preview. Does not mutate any state. */
  preview(ctx: MutationContext): Promise<CascadePreview>;

  /**
   * Precondition check (referential integrity, etc.).
   * Called by plan() — NOT by applyCascade()/applyResourceOp().  Throwing
   * here aborts the operation before any state is mutated.
   */
  validate?(ctx: MutationContext): Promise<void>;

  /**
   * Rewrite the consumer's local references (cascade).
   * Called unconditionally — for both local and foreign targets.
   */
  applyCascade(ctx: MutationContext): Promise<void>;

  /**
   * Write / rename / delete the target resource file.
   * Called ONLY when ctx.input.target.prefix === ctx.project.projectPrefix
   * (i.e. the target is local, not a foreign module resource).
   */
  applyResourceOp(ctx: MutationContext): Promise<void>;

  /** Paths the cascade would read or write; fed into the fingerprint. */
  affectedFilePaths(ctx: MutationContext): Promise<string[]>;
}
