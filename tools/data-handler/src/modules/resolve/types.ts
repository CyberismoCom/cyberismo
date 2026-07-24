import type { SealFile } from '../../mutations/replay/seal-files.js';
import type { Source, Version, VersionRange } from '../types.js';

export type UpdateRequest =
  | { kind: 'verify' }
  | { kind: 'availability'; module?: string } // module omitted ⇒ all roots
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
  // Set when the sole blocker was an explicit older target. A downgrade is
  // unreachable by replay, so it is reported as its own kind rather than
  // collapsing into a generic "no satisfying version".
  downgrade?: { from: Version; to: Version };
}
export type ResolveResult =
  { ok: true; changes: Change[] } | { ok: false; conflicts: ResolveConflict[] };
