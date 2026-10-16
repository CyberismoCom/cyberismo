// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { Source } from '@cyberismo/model';
import type { SealFile } from '../../../infra/replay-log/seal-files.js';
import type { Version, VersionRange } from '../../../shared/utils/version.js';

export type UpdateRequest =
  | { kind: 'verify' }
  | { kind: 'update'; module: string; to?: Version } // to omitted ⇒ newest in range
  | { kind: 'add'; name: string; source: Source; range?: VersionRange } // fresh import: prefetched name+source
  | { kind: 'updateAll' };

export interface Change {
  module: string;
  from: Version | null;
  to: Version | null;
  replay: SealFile[];
}
export interface ConflictDemand {
  range: VersionRange;
  from: string;
}
export interface ResolveConflict {
  module: string;
  demands: ConflictDemand[];
  /**
   * Set when the sole blocker was an explicit older target. A downgrade is
   * unreachable by replay, so it is reported as its own kind rather than
   * collapsing into a generic "no satisfying version".
   */
  downgrade?: { from: Version; to: Version };
  /**
   * Set when a version fitting the demands known at that point fell outside
   * the module's own declared range, so widening `range` in the project
   * config may unblock the resolution. No version is named: the search
   * cannot tell which one the rest of the tree would accept. `assumed` marks
   * a range the project never wrote — the default for a declaration without
   * a version.
   */
  pinned?: { range: VersionRange; assumed?: boolean };
  /**
   * Set when a version satisfying every demand (and pin) existed, but the
   * migration seal chain cannot bridge the installed version to it, so the
   * move is unreachable by replay.
   */
  nonReplayable?: { from: Version; to: Version };
}
export type ResolveResult =
  { ok: true; changes: Change[] } | { ok: false; conflicts: ResolveConflict[] };
