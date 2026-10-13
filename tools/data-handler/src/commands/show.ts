/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2024
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

// node
import { resolve } from 'node:path';

import { type ModuleListFile, MODULE_LIST_FULL_PATH } from './fetch.js';

import type {
  Context,
  HubDetails,
  HubSetting,
  ModuleSettingFromHub,
  ProjectMetadata,
  ResourceType,
  AnyResourceContent,
  CardType,
  ResourceContent,
  TemplateConfiguration,
  Workflow,
} from '@cyberismo/model';

import type { Checkout } from '../containers/project.js';
import type { ResourceMap } from '../containers/project/resource-cache.js';

import { read } from '../utils/rw-lock.js';
import { projectInfo } from '../workspace/settings.js';
import { readJsonFile } from '../utils/json.js';
import { getChildLogger } from '../utils/log-utils.js';
import { findCard } from '../cards/read.js';
import { renderSkillTemplates } from '../queries/skills.js';
import type { ResourcesFrom } from '../containers/project/resources-from.js';

/**
 * Show command.
 */
export class Show {
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

  constructor(private checkout: Checkout) {}

  private get logger() {
    return getChildLogger({
      module: 'show',
    });
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

  /**
   * Shows all card types in a project.
   * @returns array of card type details
   */
  @read
  public async showCardTypesWithDetails(): Promise<(CardType | undefined)[]> {
    const container = [];
    for (const cardType of this.checkout.resources.cardTypes()) {
      if (cardType.data) {
        container.push(cardType.data);
      }
    }
    return structuredClone(container);
  }

  /**
   * Shows importable modules.
   * @param showAll - When true, shows all importable modules, even if they have already been imported
   * @param showDetails - When true, shows all properties of modules, not just name.
   * @returns list of modules; the list content depends on the parameters provided
   *          by default it is a list of module names that could be imported into the project,
   *          with 'showDetails' true, instead of name, the list consists of full details of the modules
   *          with 'showAll' true, the list consists of all modules in the hubs, even if they have already been imported
   *          Note that the two boolean options can be combined.
   * @note Reads the cached hub data as-is; refreshing it is the caller's call.
   */
  @read
  public async showImportableModules(
    showAll?: boolean,
    showDetails?: boolean,
  ): Promise<ModuleSettingFromHub[]> {
    try {
      const moduleList = (
        await readJsonFile(
          resolve(this.checkout.basePath, MODULE_LIST_FULL_PATH),
        )
      ).modules;
      const currentModules = this.checkout.resources.moduleNames();
      const nonImportedModules = moduleList.filter(
        (item: ModuleSettingFromHub) => {
          return !currentModules.some((module) => item.name === module);
        },
      );

      if (showAll && showDetails) {
        return moduleList;
      }
      if (showAll) {
        return moduleList?.map((item: ModuleSettingFromHub) => item?.name);
      }
      if (showDetails) {
        return nonImportedModules;
      }
      // By default return the non-imported modules
      return nonImportedModules.map((item: ModuleSettingFromHub) => item?.name);
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error(error.message);
      }
      // Module list doesn't exist, return empty list
      return [];
    }
  }

  /**
   * Shows hubs of the project.
   * @returns list of hubs.
   */
  @read
  public async showHubs(): Promise<HubSetting[]> {
    return this.checkout.configuration.hubs;
  }

  /**
   * Shows hubs of the project with the modules available from each hub.
   * @returns list of hubs with their available modules.
   * @note Reads the cached hub data as-is; refreshing it is the caller's call.
   */
  @read
  public async showHubDetails(): Promise<HubDetails[]> {
    let cachedHubs: ModuleListFile['hubs'] = [];
    try {
      const moduleList = (await readJsonFile(
        resolve(this.checkout.basePath, MODULE_LIST_FULL_PATH),
      )) as ModuleListFile;
      cachedHubs = moduleList.hubs ?? [];
    } catch (error) {
      this.logger.info(
        error,
        'No readable module list; showing hubs without modules',
      );
    }

    return this.checkout.configuration.hubs.map((hub) => {
      const cached = cachedHubs.find((item) => item.location === hub.location);
      return {
        location: hub.location,
        displayName: hub.displayName ?? cached?.displayName,
        description: hub.description ?? cached?.description,
        modules: (cached?.modules ?? []) as ModuleSettingFromHub[],
      };
    });
  }

  /**
   * Shows details of a particular project.
   * @returns project information
   */
  @read
  public async showProject(): Promise<ProjectMetadata> {
    return projectInfo(this.checkout);
  }

  /**
   * Shows details of certain resource.
   * @param name Name of resource.
   * @param showUse If true, shows also where resource is used.
   * @param resourceType If specified, checks that the resource is given type.
   * @returns resource metadata as JSON.
   */
  public async showResource(
    name: string,
    showUse?: boolean,
  ): Promise<AnyResourceContent>;
  public async showResource<T extends ResourceType>(
    name: string,
    resourceType: T,
    showUse?: boolean,
  ): Promise<ResourceContent<T>>;
  @read
  public async showResource(
    name: string,
    arg2?: boolean | ResourceType,
    arg3?: boolean,
  ): Promise<AnyResourceContent> {
    const hasResourceType = typeof arg2 === 'string';
    const resourceType = hasResourceType ? arg2 : null;
    const showUse = hasResourceType ? arg3 : arg2;

    const type = this.checkout.resources.extractType(name);
    if (resourceType !== null && resourceType !== type) {
      throw new Error(
        `While fetching '${name}': Expected type '${resourceType}', but got '${type}' instead`,
      );
    }
    const resource = this.checkout.resources.byType(name, type);
    const [shown, usage] = await Promise.all([
      resource?.show(),
      showUse ? resource?.usage() : [],
    ]);
    const details = structuredClone(shown);
    if (showUse) {
      return {
        ...details,
        usedIn: [...usage],
      };
    } else {
      return details;
    }
  }

  /**
   * Shows all available resources of a given type.
   * @param type Name of resources to return (in plural form, e.g. 'templates')
   * @returns sorted array of resources
   */
  @read
  public async showResources(type: string): Promise<string[]> {
    const func = this.resourceFunctions[type];
    if (!func) return [];
    return func().sort();
  }

  /**
   * Shows all templates with full details in a project.
   * @returns all templates in a project.
   */
  @read
  public async showTemplatesWithDetails(): Promise<TemplateConfiguration[]> {
    const templates = [];
    for (const template of this.checkout.resources.templates()) {
      templates.push(template.show());
    }
    return structuredClone(templates);
  }

  /**
   * Shows all workflows with full details in a project.
   * @returns workflows with full details
   */
  @read
  public async showWorkflowsWithDetails(): Promise<(Workflow | undefined)[]> {
    const workflows = [];
    for (const workflow of this.checkout.resources.workflows()) {
      workflows.push(workflow.data);
    }
    return structuredClone(workflows);
  }

  /**
   * Renders a skill's instructions without checking whether it is enabled.
   *
   * This is what the configuration editor previews: the author is still working
   * on the skill, so its enablement state is irrelevant. Passing 'skillContent'
   * or 'skillQuery' renders unsaved editor content instead of what is on disk.
   * @param name Full skill resource name.
   * @param options.cardKey Card context for per-card template rendering.
   * @param options.skillContent Overrides the stored skill.md content.
   * @param options.skillQuery Overrides the stored query.lp content.
   * @param context Calculation context.
   * @returns the rendered instructions.
   * @throws if the skill or the card does not exist, or if rendering fails.
   */
  @read
  public async renderSkill(
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
}
