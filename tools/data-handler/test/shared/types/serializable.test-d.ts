/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

// Type test: checked by `tsc -p tsconfig.types.json`, never run.
// Every API method takes and returns only JSON-serialisable data
// (Uint8Array allowed for bytes): no functions, class instances or Dates.
// `unknown` is trusted as an untyped JSON payload (an edit's value); `any` is not.

import type { ChangeEvent } from '@cyberismo/model';
import type { Cards } from '../../../src/domain/cards/cards.js';
import type { Clean } from '../../../src/domain/clean/clean.js';
import type { createProject } from '../../../src/api/directory/create-project.js';
import type { ProjectDirectory } from '../../../src/api/directory/project-directory.js';
import type { Export } from '../../../src/domain/export/export.js';
import type { Render } from '../../../src/domain/macros/render.js';
import type { Modules } from '../../../src/domain/modules/modules.js';
import type { Queries } from '../../../src/domain/queries/queries.js';
import type { Versions } from '../../../src/domain/versions/version.js';
import type { Changes } from '../../../src/domain/resources/changes.js';
import type { Resources } from '../../../src/domain/resources/resources.js';
import type { Hubs, Settings } from '../../../src/domain/settings/settings.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFunction = (...args: any[]) => unknown;

// `false` somewhere in the union when T is not serialisable. A recursive type
// (a card's childrenCards) is trusted below the depth D counts down from.
type Check<T, D extends unknown[] = []> = D['length'] extends 6
  ? true
  : 0 extends 1 & T
    ? false
    : unknown extends T
      ? true
      : T extends string | number | bigint | boolean | null | undefined | void
        ? true
        : T extends Uint8Array
          ? true
          : T extends AnyFunction
            ? false
            : T extends readonly (infer U)[]
              ? Check<U, [...D, 0]>
              : T extends object
                ? { [K in keyof T]-?: Check<T[K], [...D, 0]> }[keyof T]
                : false;

export type Serializable<T> = false extends Check<T> ? false : true;

type MethodKeys<F> = {
  [K in keyof F]: F[K] extends AnyFunction ? K : never;
}[keyof F];

// Per method: its parameters and awaited result are serialisable.
type ApiSerializable<F> = {
  [K in MethodKeys<F>]: F[K] extends (...args: infer P) => infer R
    ? Serializable<P> extends true
      ? Serializable<Awaited<R>>
      : false
    : false;
};

// Per property: its value is serialisable.
type PropertiesSerializable<F> = {
  [K in keyof F as F[K] extends AnyFunction ? never : K]: Serializable<F[K]>;
};

// The check itself rejects what it should.
export const rejects: [
  Serializable<{ at: Date }>,
  Serializable<() => void>,
  Serializable<Map<string, string>>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Serializable<any>,
] = [false, false, false, false];

export const cards: ApiSerializable<Cards> = {
  move: true,
  rank: true,
  rankFirst: true,
  rankAt: true,
  rebalance: true,
  rebalanceAll: true,
  edit: true,
  editField: true,
  transition: true,
  remove: true,
  addLabel: true,
  removeLabel: true,
  addLink: true,
  removeLink: true,
  addAttachment: true,
  removeAttachment: true,
  renameAttachment: true,
  create: true,
  importCsv: true,
  addToTemplate: true,
  list: true,
  details: true,
  has: true,
  roots: true,
  templateCards: true,
  attachments: true,
  attachment: true,
  labels: true,
  logicProgram: true,
};

// hubs is an API of its own, checked below.
export const settings: ApiSerializable<Settings> &
  PropertiesSerializable<Omit<Settings, 'hubs'>> = {
  actor: true,
  identity: true,
  name: true,
  prefix: true,
  category: true,
  description: true,
  info: true,
  gitRemoteUrl: true,
  setName: true,
  setDescription: true,
  setCategory: true,
  setGitRemoteUrl: true,
};

export const hubs: ApiSerializable<Hubs> & PropertiesSerializable<Hubs> = {
  actor: true,
  identity: true,
  add: true,
  remove: true,
};

// subscribe is exempt: a listener is a function (remote, it is SSE); the
// event it receives is checked instead.
export const changes: ApiSerializable<Omit<Changes, 'subscribe'>> &
  PropertiesSerializable<Changes> = {
  actor: true,
  identity: true,
  apply: true,
};

export const changeEvent: Serializable<ChangeEvent> = true;

export const resources: ApiSerializable<Resources> &
  PropertiesSerializable<Resources> = {
  actor: true,
  identity: true,
  create: true,
  remove: true,
  validate: true,
  show: true,
  list: true,
  usage: true,
  contents: true,
  skills: true,
  skill: true,
  skillPreview: true,
};

export const queries: ApiSerializable<Queries> = {
  program: true,
  runGraph: true,
  runWorkflowGraph: true,
  runLogicProgram: true,
  runQuery: true,
  logicProgram: true,
  runReport: true,
};

export const clean: ApiSerializable<Clean> & PropertiesSerializable<Clean> = {
  actor: true,
  identity: true,
  run: true,
  dormantSummary: true,
};

export const versions: ApiSerializable<Versions> &
  PropertiesSerializable<Versions> = {
  actor: true,
  identity: true,
  bump: true,
  publish: true,
};

export const render: ApiSerializable<Render> = {
  macros: true,
  xrefs: true,
};

export const exports: ApiSerializable<Export> = {
  pdf: true,
  adoc: true,
};

export const modules: ApiSerializable<Modules> &
  PropertiesSerializable<Modules> = {
  actor: true,
  identity: true,
  install: true,
  planUpdate: true,
  update: true,
  remove: true,
  list: true,
  inventory: true,
  listVersions: true,
  show: true,
  importable: true,
  hubs: true,
  hubDetails: true,
  fetchHubs: true,
  ensureModuleListUpToDate: true,
  ensureModuleListExists: true,
};

// open and replace are lifecycle: open gives a handle, replace a checkout.
export const directory: ApiSerializable<
  Omit<ProjectDirectory, 'open' | 'replace'>
> = {
  list: true,
  create: true,
  clone: true,
  rename: true,
};

// The directory's create at a path of the caller's.
export const creation: ApiSerializable<{
  createProject: typeof createProject;
}> = {
  createProject: true,
};
