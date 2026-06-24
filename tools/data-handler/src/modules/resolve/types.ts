import type { SealFile } from '../../mutations/replay/seal-files.js';
import type { Source, Version, VersionRange } from '../types.js';

export type UpdateRequest =
  | { kind: 'verify' }
  | { kind: 'availability'; module?: string }        // module omitted ⇒ all roots
  | { kind: 'update'; module: string; to?: Version } // to omitted ⇒ newest in range
  | { kind: 'add'; name: string; source: Source; range?: VersionRange } // fresh import: prefetched name+source
  | { kind: 'updateAll' };

export interface Change { module: string; from: Version | null; to: Version; replay: SealFile[]; }
export interface ConflictDemand { range: VersionRange; from: string; }
export interface ResolveConflict { module: string; demands: ConflictDemand[]; }
export type ResolveResult =
  | { ok: true; changes: Change[] }
  | { ok: false; conflicts: ResolveConflict[] };
