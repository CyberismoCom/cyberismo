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

  /** Apply the resource-definition change and the cascade. */
  apply(ctx: MutationContext): Promise<void>;

  /** Paths the cascade would read or write; fed into the fingerprint. */
  affectedFilePaths(ctx: MutationContext): Promise<string[]>;
}
