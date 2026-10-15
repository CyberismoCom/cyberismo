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

import type {
  ActorRef,
  AnyResourceContent,
  Context,
  CreateParamsByType,
  ResourceContent,
  ResourceName,
  ResourceType,
  SkillLookupResult,
  SkillSummary,
} from '@cyberismo/model';
import { findCard } from '../../domain/cards/read.js';
import { Validate } from '../../domain/validation/validate.js';
import type { Checkout } from '../../state/checkout/checkout.js';
import type { ResourceMap } from '../../state/resources/resource-cache.js';
import { pluralResourceType } from '../../state/resources/resource-handler.js';
import type { ResourcesFrom } from '../../state/resources/resources-from.js';
import { createSubject } from '../../domain/resources/changes/resource-mutations.js';
import {
  getSkill,
  listSkills,
  renderSkillTemplates,
} from '../../domain/queries/skills.js';
import { runWithDefaultCommitMessage } from '../../infra/tx/commit-context.js';
import { resourceName } from '../../shared/utils/resource-utils.js';
import { read, write } from '../../infra/tx/rw-lock.js';
import type { CommitIdentity } from '../../infra/tx/tx-record.js';
import type { Changes } from './changes.js';

/**
 * Resources of one handle. Writes go through the handle's changes. Holds no
 * state of its own.
 */
export class Resources {
  private readonly resourceFunctions: Record<
    string,
    (from?: ResourcesFrom) => string[]
  > = {
    calculations: (from) => this.resourceNames('calculations', from),
    cardTypes: (from) => this.resourceNames('cardTypes', from),
    fieldTypes: (from) => this.resourceNames('fieldTypes', from),
    graphModels: (from) => this.resourceNames('graphModels', from),
    graphViews: (from) => this.resourceNames('graphViews', from),
    linkTypes: (from) => this.resourceNames('linkTypes', from),
    reports: (from) => this.resourceNames('reports', from),
    skills: (from) => this.resourceNames('skills', from),
    templates: (from) => this.resourceNames('templates', from),
    workflows: (from) => this.resourceNames('workflows', from),
  };

  /** @internal */
  constructor(
    private readonly checkout: Checkout,
    private readonly changes: Changes,
    public readonly actor: ActorRef,
    public readonly identity: CommitIdentity | undefined,
  ) {}

  /**
   * Creates a resource of `type`; `name` is its identifier or its full
   * resource name. Sugar for a 'create' change.
   * @throws if `name` names a resource of another type.
   */
  public async create<T extends keyof CreateParamsByType>(
    name: string,
    type: T,
    params: CreateParamsByType[T],
  ): Promise<void> {
    const target = resourceName(
      name && name.split('/').length === 1
        ? `${this.checkout.projectPrefix}/${type}/${name}`
        : name,
    );
    if (target.type !== type) {
      throw new Error(`Resource '${name}' is not of type '${type}'`);
    }
    await runWithDefaultCommitMessage(createSubject(type, name), () =>
      this.changes.apply({ kind: 'create', target, params }),
    );
  }

  /**
   * Deletes a resource, with its cascade. `name` is its full resource name,
   * or its identifier in this project when `type` (singular, e.g.
   * 'workflow') says which.
   */
  @write((name, type) => `Remove ${type} ${name}`)
  public async remove(name: string, type: string): Promise<void> {
    const parsed = resourceName(name);
    await this.changes.apply({
      kind: 'delete',
      target: {
        prefix: parsed.prefix || this.checkout.configuration.cardKeyPrefix,
        type: parsed.type || pluralResourceType(type),
        identifier: parsed.identifier,
      },
    });
  }

  /** The resource's validation errors; '' when it is valid. */
  @read
  public async validate(name: ResourceName): Promise<string> {
    return Validate.getInstance().validateResource(name, this.checkout);
  }

  /**
   * A copy of the resource's content.
   * @throws if `resourceType` is given and the resource is of another type.
   */
  public async show(name: string): Promise<AnyResourceContent>;
  public async show<T extends ResourceType>(
    name: string,
    resourceType: T,
  ): Promise<ResourceContent<T>>;
  @read
  public async show(
    name: string,
    resourceType?: ResourceType,
  ): Promise<AnyResourceContent> {
    const type = this.checkout.resources.extractType(name);
    if (resourceType !== undefined && resourceType !== type) {
      throw new Error(
        `While fetching '${name}': Expected type '${resourceType}', but got '${type}' instead`,
      );
    }
    return structuredClone(this.checkout.resources.byType(name, type).show());
  }

  /** The sorted names of the resources of `type`; none if it is no type. */
  @read
  public async list(type: string): Promise<string[]> {
    const func = this.resourceFunctions[type];
    if (!func) return [];
    return func().sort();
  }

  /** Where the resource is used: card keys first, then resource names. */
  @read
  public async usage(name: string): Promise<string[]> {
    const type = this.checkout.resources.extractType(name);
    const usage = await this.checkout.resources.byType(name, type).usage();
    return [...usage];
  }

  /** Copies of the contents of every readable resource of `type`. */
  @read
  public async contents<T extends ResourceType>(
    type: T,
  ): Promise<ResourceContent<T>[]> {
    const contents = this.checkout.resources
      .resourceTypes(type)
      .map((resource) => resource.show() as ResourceContent<T>)
      // A resource whose file could not be read shows no name.
      .filter((content) => content.name);
    return structuredClone(contents);
  }

  /** The skills the project's logic programs enable, as copies. */
  @read
  public async skills(
    options: { cardKey?: string; category?: string } = {},
    context: Context = 'localApp',
  ): Promise<SkillSummary[]> {
    return structuredClone(await listSkills(this.checkout, options, context));
  }

  /** An enabled skill with its rendered instructions, as a copy. */
  @read
  public async skill(
    name: string,
    options: { cardKey?: string } = {},
    context: Context = 'localApp',
  ): Promise<SkillLookupResult> {
    return structuredClone(
      await getSkill(this.checkout, name, options, context),
    );
  }

  /**
   * A skill's rendered instructions, enabled or not; skillContent/skillQuery render unsaved content.
   */
  @read
  public async skillPreview(
    name: string,
    options: {
      cardKey?: string;
      skillContent?: string;
      skillQuery?: string;
    } = {},
    context: Context = 'localApp',
  ): Promise<string> {
    const skill = this.checkout.resources.byType(name, 'skills').show();

    if (options.cardKey) {
      findCard(this.checkout, options.cardKey);
    }

    return renderSkillTemplates(this.checkout, skill.content, options, context);
  }

  // Fetch resource names as a list
  private resourceNames<T extends keyof ResourceMap>(
    resourceType: T,
    from?: ResourcesFrom,
  ): string[] {
    return this.checkout.resources
      .resourceTypes(resourceType, from)
      .map((item) => item.data?.name || '');
  }
}
