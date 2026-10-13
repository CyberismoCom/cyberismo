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

// Test-only: builds a project on disk from a declarative spec. Not exported
// from the package; other packages' tests import it by relative path.

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { simpleGit } from 'simple-git';

import { SCHEMA_VERSION } from '@cyberismo/migrations';
import { FIRST_RANK, getRankAfter } from '../../src/utils/lexorank.js';

export interface WorkflowSpec {
  name: string;
  /** Defaults to Open (initial) → In Progress (active) → Closed (closed). */
  states?: { name: string; category: 'initial' | 'active' | 'closed' }[];
  /** Defaults to a Create transition into the first state, then one per state. */
  transitions?: { name: string; fromState: string[]; toState: string }[];
}

export interface CardTypeSpec {
  name: string;
  /** Workflow short name or full resource name; defaults to the first workflow. */
  workflow?: string;
  /** Field type short names or full names; a calculated field may allow override. */
  customFields?: {
    name: string;
    isCalculated?: boolean;
    enableOverride?: boolean;
  }[];
  /** Field type names listed in the card's exported metadata table. */
  alwaysVisibleFields?: string[];
}

export interface FieldTypeSpec {
  name: string;
  dataType: string;
  /** Enum values of an enum field type. */
  enumValues?: string[];
}

export interface LinkTypeSpec {
  name: string;
  /** Card type names; empty or absent allows every card type. */
  sourceCardTypes?: string[];
  destinationCardTypes?: string[];
  enableLinkDescription?: boolean;
  destinationConnectors?: string[];
}

export interface CardSpec {
  /** Card type short name or full resource name; defaults to the first card type. */
  cardType?: string;
  title?: string;
  /** Defaults to the workflow's initial state. */
  workflowState?: string;
  labels?: string[];
  content?: string;
  /** Custom field values, written into the card's metadata. */
  fields?: Record<string, unknown>;
  /** Links to project cards; `to` indexes the depth-first project card keys. */
  links?: { linkType: string; to: number; linkDescription?: string }[];
  children?: CardSpec[];
}

export interface TemplateSpec {
  name: string;
  cards?: CardSpec[];
}

/** Resources of one prefix; the project itself and each module have one. */
export interface ResourceSpec {
  workflows?: WorkflowSpec[];
  cardTypes?: CardTypeSpec[];
  fieldTypes?: FieldTypeSpec[];
  linkTypes?: LinkTypeSpec[];
  templates?: TemplateSpec[];
  /** Calculation name → logic program appended as its own calculation file. */
  calculations?: Record<string, string>;
  /** Report name → its logic program query and content template (Handlebars). */
  reports?: Record<string, { query?: string; content: string }>;
}

export interface ModuleSpec extends ResourceSpec {
  prefix: string;
}

export interface ProjectSpec extends ResourceSpec {
  prefix?: string;
  name?: string;
  /** The project's published version, as cardsConfig.json holds it. */
  version?: string;
  /** Seed for card keys; the same spec and seed give the same keys and bytes. */
  seed?: number;
  cards?: CardSpec[];
  /** Installed under .cards/modules/<prefix> and declared in cardsConfig. */
  modules?: ModuleSpec[];
  /** Hubs declared in cardsConfig, as written there. */
  hubs?: { location: string; displayName?: string; description?: string }[];
  /** `git init` plus one commit of the whole project. */
  git?: boolean;
}

export interface BuiltProject {
  path: string;
  /** Project card keys in depth-first spec order. */
  keys: string[];
  /** Template card keys in depth-first spec order, by full template name. */
  templateKeys: Record<string, string[]>;
  cleanup: () => Promise<void>;
}

const TIMESTAMP = '2026-01-01T00:00:00.000Z';
const DEFAULT_STATES: NonNullable<WorkflowSpec['states']> = [
  { name: 'Open', category: 'initial' },
  { name: 'In Progress', category: 'active' },
  { name: 'Closed', category: 'closed' },
];
const SCHEMA_IDS: Record<string, string> = {
  calculations: 'calculationSchema',
  cardTypes: 'cardTypeSchema',
  fieldTypes: 'fieldTypeSchema',
  linkTypes: 'linkTypeSchema',
  templates: 'templateSchema',
  workflows: 'workflowSchema',
};

// mulberry32: a small deterministic PRNG.
function prng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fullName(prefix: string, type: string, name: string): string {
  return name.includes('/') ? name : `${prefix}/${type}/${name}`;
}

async function writeJson(path: string, content: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(content, null, 4) + '\n');
}

function fail(message: string): never {
  throw new Error(message);
}

async function writeSchema(folder: string, id: string): Promise<void> {
  await writeJson(join(folder, '.schema'), [{ id, version: 1 }]);
}

class Builder {
  private random: () => number;
  private usedKeys = new Set<string>();
  private initialStates = new Map<string, string>();
  private cardTypeWorkflows = new Map<string, string>();
  private pendingLinks: {
    file: string;
    links: NonNullable<CardSpec['links']>;
  }[] = [];
  readonly keys: string[] = [];
  readonly templateKeys: Record<string, string[]> = {};

  constructor(
    private path: string,
    private spec: ProjectSpec,
    private prefix: string,
  ) {
    this.random = prng(spec.seed ?? 1);
  }

  private nextKey(prefix: string): string {
    for (;;) {
      let suffix = '';
      while (suffix.length < 8) {
        suffix += Math.floor(this.random() * 36).toString(36);
      }
      const key = `${prefix}_${suffix}`;
      if (!this.usedKeys.has(key)) {
        this.usedKeys.add(key);
        return key;
      }
    }
  }

  // Writes one prefix's resources into `folder` (.cards/local or a module).
  async writeResources(
    folder: string,
    prefix: string,
    spec: ResourceSpec,
    config: Record<string, unknown>,
  ): Promise<void> {
    await writeSchema(folder, 'cardsConfigSchema');
    await writeJson(join(folder, 'cardsConfig.json'), config);
    for (const [type, id] of Object.entries(SCHEMA_IDS)) {
      await writeSchema(join(folder, type), id);
    }

    const workflows = spec.workflows ?? [];
    const owner = this.owner(prefix);
    for (const workflow of workflows) {
      const states = workflow.states ?? DEFAULT_STATES;
      const transitions = workflow.transitions ?? [
        { name: 'Create', fromState: [], toState: states[0].name },
        ...states.slice(1).map((state) => ({
          name: `To ${state.name}`,
          fromState: ['*'],
          toState: state.name,
        })),
      ];
      const name = fullName(prefix, 'workflows', workflow.name);
      this.initialStates.set(
        name,
        transitions.find((t) => t.fromState.length === 0)?.toState ??
          states[0].name,
      );
      await writeJson(join(folder, 'workflows', `${workflow.name}.json`), {
        name,
        displayName: workflow.name,
        states,
        transitions,
      });
    }

    for (const cardType of spec.cardTypes ?? []) {
      const name = fullName(prefix, 'cardTypes', cardType.name);
      const workflow = fullName(
        prefix,
        'workflows',
        cardType.workflow ??
          workflows[0]?.name ??
          fail(`${owner}: card type ${cardType.name} needs a workflow`),
      );
      this.cardTypeWorkflows.set(name, workflow);
      await writeJson(join(folder, 'cardTypes', `${cardType.name}.json`), {
        name,
        displayName: cardType.name,
        workflow,
        customFields: cardType.customFields?.map((field) => ({
          ...field,
          name: fullName(prefix, 'fieldTypes', field.name),
        })),
        alwaysVisibleFields: cardType.alwaysVisibleFields?.map((name) =>
          fullName(prefix, 'fieldTypes', name),
        ),
      });
    }

    for (const fieldType of spec.fieldTypes ?? []) {
      await writeJson(join(folder, 'fieldTypes', `${fieldType.name}.json`), {
        name: fullName(prefix, 'fieldTypes', fieldType.name),
        displayName: fieldType.name,
        dataType: fieldType.dataType,
        enumValues: fieldType.enumValues?.map((enumValue) => ({ enumValue })),
      });
    }

    for (const linkType of spec.linkTypes ?? []) {
      const qualify = (names: string[] = []) =>
        names.map((name) => fullName(prefix, 'cardTypes', name));
      await writeJson(join(folder, 'linkTypes', `${linkType.name}.json`), {
        name: fullName(prefix, 'linkTypes', linkType.name),
        displayName: linkType.name,
        outboundDisplayName: `${linkType.name} out`,
        inboundDisplayName: `${linkType.name} in`,
        sourceCardTypes: qualify(linkType.sourceCardTypes),
        destinationCardTypes: qualify(linkType.destinationCardTypes),
        destinationConnectors: linkType.destinationConnectors,
        enableLinkDescription: linkType.enableLinkDescription ?? false,
      });
    }

    for (const [name, program] of Object.entries(spec.calculations ?? {})) {
      await writeJson(join(folder, 'calculations', `${name}.json`), {
        name: fullName(prefix, 'calculations', name),
        displayName: name,
        calculation: '',
      });
      await mkdir(join(folder, 'calculations', name), { recursive: true });
      await writeFile(
        join(folder, 'calculations', name, 'calculation.lp'),
        program,
      );
    }

    if (spec.reports)
      await writeSchema(join(folder, 'reports'), 'reportSchema');
    for (const [name, report] of Object.entries(spec.reports ?? {})) {
      await writeJson(join(folder, 'reports', `${name}.json`), {
        name: fullName(prefix, 'reports', name),
        displayName: name,
      });
      const reportFolder = join(folder, 'reports', name);
      await mkdir(reportFolder, { recursive: true });
      await writeJson(join(reportFolder, '.schema'), [
        { id: 'reportSchema', version: 1, file: `../${name}.json` },
      ]);
      await writeFile(join(reportFolder, 'query.lp.hbs'), report.query ?? '');
      await writeFile(join(reportFolder, 'index.adoc.hbs'), report.content);
      await writeJson(join(reportFolder, 'parameterSchema.json'), {
        title: 'Report',
        $id: `${name}Schema`,
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name'],
      });
    }

    for (const template of spec.templates ?? []) {
      const name = fullName(prefix, 'templates', template.name);
      await writeJson(join(folder, 'templates', `${template.name}.json`), {
        name,
        displayName: template.name,
      });
      const cardsFolder = join(folder, 'templates', template.name, 'c');
      await writeSchema(cardsFolder, 'cardBaseSchema');
      this.templateKeys[name] = [];
      await this.writeCards(
        cardsFolder,
        prefix,
        template.cards ?? [],
        spec,
        this.templateKeys[name],
      );
    }
  }

  async writeCards(
    folder: string,
    prefix: string,
    cards: CardSpec[],
    owner: ResourceSpec,
    keys: string[],
  ): Promise<void> {
    let rank = FIRST_RANK;
    for (const card of cards) {
      const key = this.nextKey(prefix);
      keys.push(key);
      const cardType = fullName(
        prefix,
        'cardTypes',
        card.cardType ??
          owner.cardTypes?.[0]?.name ??
          fail(`${this.owner(prefix)}: card ${key} needs a card type`),
      );
      const workflow =
        this.cardTypeWorkflows.get(cardType) ??
        fail(`${this.owner(prefix)}: card type ${cardType} is not defined yet`);
      await writeJson(join(folder, key, 'index.json'), {
        cardType,
        title: card.title ?? `Card ${key}`,
        workflowState:
          card.workflowState ??
          this.initialStates.get(workflow) ??
          fail(
            `${this.owner(prefix)}: workflow ${workflow} is not defined yet`,
          ),
        rank,
        lastUpdated: TIMESTAMP,
        labels: card.labels ?? [],
        links: [],
        ...card.fields,
      });
      if (card.links?.length) {
        this.pendingLinks.push({
          file: join(folder, key, 'index.json'),
          links: card.links,
        });
      }
      await writeFile(join(folder, key, 'index.adoc'), card.content ?? '');
      if (card.children?.length) {
        await this.writeCards(
          join(folder, key, 'c'),
          prefix,
          card.children,
          owner,
          keys,
        );
      }
      rank = getRankAfter(rank);
    }
  }

  async build(): Promise<void> {
    const spec = this.spec;
    const modules = spec.modules ?? [];
    // Modules first: project card types may name module workflows.
    for (const module of modules) {
      await this.writeResources(
        join(this.path, '.cards', 'modules', module.prefix),
        module.prefix,
        module,
        this.config(module.prefix, module.prefix, []),
      );
    }
    const local: ResourceSpec = {
      ...spec,
      workflows: spec.workflows ?? [{ name: 'default' }],
      cardTypes: spec.cardTypes ?? [{ name: 'page' }],
    };
    await this.writeResources(
      join(this.path, '.cards', 'local'),
      this.prefix,
      local,
      this.config(
        this.prefix,
        spec.name ?? this.prefix,
        modules.map((module) => ({
          name: module.prefix,
          location: `file:../${module.prefix}`,
        })),
        spec.hubs,
        spec.version,
      ),
    );
    const cardRoot = join(this.path, 'cardRoot');
    await writeSchema(cardRoot, 'cardBaseSchema');
    await this.writeCards(
      cardRoot,
      this.prefix,
      spec.cards ?? [],
      local,
      this.keys,
    );
    for (const { file, links } of this.pendingLinks) {
      const metadata = JSON.parse(await readFile(file, 'utf-8'));
      metadata.links = links.map((link) => ({
        linkType: fullName(this.prefix, 'linkTypes', link.linkType),
        cardKey: this.keys[link.to] ?? fail(`link target ${link.to} missing`),
        linkDescription: link.linkDescription,
      }));
      await writeJson(file, metadata);
    }
    await writeFile(join(this.path, '.gitignore'), '.calc\n.temp\n.logs\n');
  }

  private owner(prefix: string): string {
    return prefix === this.prefix ? `project ${prefix}` : `module ${prefix}`;
  }

  private config(
    prefix: string,
    name: string,
    modules: unknown[],
    hubs: unknown[] = [],
    version?: string,
  ) {
    return {
      ...(version ? { version } : {}),
      schemaVersion: SCHEMA_VERSION,
      cardKeyPrefix: prefix,
      name,
      description: '',
      modules,
      hubs,
    };
  }
}

/**
 * Builds a project under os.tmpdir() from `spec`. Resource names in the spec
 * are short identifiers resolved against the owning prefix; a name containing
 * '/' is used as is, e.g. to point a project card type at a module workflow.
 */
export async function buildProject(
  spec: ProjectSpec = {},
): Promise<BuiltProject> {
  const path = await mkdtemp(join(tmpdir(), 'cyberismo-project-'));
  const builder = new Builder(path, spec, spec.prefix ?? 'test');
  const cleanup = () =>
    rm(path, { recursive: true, force: true, maxRetries: 5 });
  try {
    await builder.build();
    if (spec.git) {
      // user.* and signing are overridden; the user's global git config still
      // loads, so hooks are skipped.
      const git = simpleGit(path, {
        config: [
          'user.name=Test',
          'user.email=test@example.com',
          'commit.gpgsign=false',
          // background maintenance would race the cleanup of the project
          'maintenance.auto=false',
          'gc.auto=0',
        ],
      });
      await git.init(['--initial-branch=main']);
      await git.add('.');
      await git.commit('Initial commit', undefined, { '--no-verify': null });
    }
  } catch (error) {
    await cleanup();
    throw error;
  }
  return {
    path,
    keys: builder.keys,
    templateKeys: builder.templateKeys,
    cleanup,
  };
}
