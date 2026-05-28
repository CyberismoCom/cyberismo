// tools/data-handler/src/mutations/types.ts

import type { Operation } from '../resources/resource-object.js';
import type { UpdateKey } from '../interfaces/resource-interfaces.js';
import type { ResourceName } from '../utils/resource-utils.js';

/** The four kinds of breaking change recorded in the migration log. */
export type MutationKind =
  | 'edit' // sub-property add/change/rank/remove
  | 'delete' // whole-resource delete
  | 'rename' // whole-resource rename
  | 'project_rename';

/** Discriminated input describing the change a maintainer wants to make. */
export type MutationInput =
  | {
      kind: 'edit';
      target: ResourceName;
      updateKey: UpdateKey<string>;
      operation: Operation<unknown>;
    }
  | { kind: 'delete'; target: ResourceName }
  | { kind: 'rename'; target: ResourceName; newIdentifier: string }
  | { kind: 'project_rename'; newPrefix: string };

/** What the cascade would touch. Aggregate counts plus a human summary. */
export interface CascadePreview {
  affectedCardCount: number;
  affectedLinkCount: number;
  affectedCalculationCount: number;
  affectedHandlebarFileCount: number;
  dataLossExpected: boolean;
  summary: string;
}

/** Deterministic hash over input + current state of every artefact the cascade touches. */
export interface MutationFingerprint {
  digest: string;
}

/** Returned from plan(); safe to serialise across HTTP. */
export interface PreviewResult {
  input: MutationInput;
  isBreaking: boolean;
  preview: CascadePreview;
  fingerprint: MutationFingerprint;
}

/** Options accepted by apply(). */
export interface ApplyOptions {
  /**
   * Required when isBreaking and the preview shows cascade effects. In the
   * CLI's same-process flow the caller can compute the fingerprint inline.
   * The HTTP layer must round-trip it from the preview response.
   */
  fingerprint?: MutationFingerprint;
  /** Commit message used by runWithDefaultCommitMessage; optional. */
  commitMessage?: string;
  /**
   * Skip the fingerprint requirement entirely. Set by the module-update
   * replay path: the consumer's state may legitimately differ from the
   * author's, so the drift check that protects interactive edits would
   * just abort every replay. Cascade still runs tolerantly.
   */
  bypassFingerprint?: boolean;
}

/** Result of apply(). */
export interface ApplyResult {
  success: true;
}
