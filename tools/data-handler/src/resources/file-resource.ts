/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2024

  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

// node
import { basename, join, sep } from 'node:path';
import { mkdir, rename } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';

import type {
  Card,
  FetchCardDetails,
  ResourceFolderType,
} from '../interfaces/project-interfaces.js';
import {
  type AddOperation,
  type ChangeOperation,
  type Operation,
  type RemoveOperation,
  ResourceObject,
} from './resource-object.js';
import { DefaultContent } from './create-defaults.js';
import { deleteFile, pathExists } from '../utils/file-utils.js';
import { Project, ResourcesFrom } from '../containers/project.js';
import {
  readJsonFile,
  readJsonFileSync,
  writeJsonFile,
} from '../utils/json.js';
import type {
  ResourceBaseMetadata,
  ResourceContent,
} from '../interfaces/resource-interfaces.js';
import {
  type ResourceName,
  resourceName,
  resourceNameToPath,
  resourceNameToString,
} from '../utils/resource-utils.js';
import type { Resource } from '../interfaces/project-interfaces.js';
import { sortCards } from '../utils/card-utils.js';
import { Template } from '../containers/template.js';
import { Validate } from '../commands/index.js';

export {
  type AddOperation,
  type Card,
  type ChangeOperation,
  DefaultContent,
  type Operation,
  Project,
  RemoveOperation,
  ResourcesFrom,
  resourceName,
  type ResourceName,
  resourceNameToString,
  sortCards,
};

/**
 * Base class for file based resources (card types, field types, link types, workflows, ...)
 */
export class FileResource extends ResourceObject {
  public fileName: string = '';
  protected content: ResourceBaseMetadata = { name: '' };
  private cache: Map<string, JSON>;

  constructor(
    project: Project,
    resourceName: ResourceName,
    protected type: ResourceFolderType,
  ) {
    super(project, resourceName);
    this.cache = this.project.resourceCache;
  }

  // Type of resource.
  private resourceType(): ResourceFolderType {
    return this.type as ResourceFolderType;
  }

  // Converts resource name to Resource object.
  private resourceObjectToResource(object: FileResource): Resource {
    return {
      name: object.data ? object.data.name : '',
      path: object.fileName.substring(0, object.fileName.lastIndexOf(sep)),
    };
  }

  private toCache() {
    this.cache.set(
      resourceNameToString(this.resourceName),
      this.content as unknown as JSON,
    );
  }

  // Collects cards that are using the 'cardTypeName'.
  protected async collectCards(
    cardContent: FetchCardDetails,
    cardTypeName: string,
  ) {
    async function filteredCards(
      cardSource: Promise<Card[]>,
      cardTypeName: string,
    ): Promise<Card[]> {
      const cards = await cardSource;
      return cards.filter((card) => card.metadata?.cardType === cardTypeName);
    }

    // Collect both project cards ...
    const projectCardsPromise = filteredCards(
      this.project.cards(this.project.paths.cardRootFolder, cardContent),
      cardTypeName,
    );
    // ... and cards from each template that would be affected.
    const templates = await this.project.templates(ResourcesFrom.localOnly);
    const templateCardsPromises = templates.map((template) => {
      const templateObject = new Template(this.project, template);
      return filteredCards(templateObject.cards('', cardContent), cardTypeName);
    });
    // Return all affected cards
    const cards = (
      await Promise.all([projectCardsPromise, ...templateCardsPromises])
    ).reduce((accumulator, value) => accumulator.concat(value), []);
    return cards;
  }

  // Initialize the resource.
  protected initialize() {
    if (this.resourceName.type === '') {
      this.resourceName.type = this.type;
    }
    if (this.resourceName.prefix === '') {
      this.resourceName.prefix = this.project.projectPrefix;
    }
    if (this.type) {
      this.moduleResource =
        this.resourceName.prefix !== this.project.projectPrefix;
      this.resourceFolder = this.moduleResource
        ? join(
            this.project.paths.modulesFolder,
            this.resourceName.prefix,
            this.resourceName.type,
          )
        : this.project.paths.resourcePath(this.type);
      this.fileName = resourceNameToPath(this.project, this.resourceName);
    }
    // Read from cache, if entry exists...
    if (this.cache.has(resourceNameToString(this.resourceName))) {
      this.content = this.cache.get(
        resourceNameToString(this.resourceName),
      ) as unknown as ResourceBaseMetadata;
      return;
    }
    //... otherwise read from disk and add to cache
    try {
      this.content = readJsonFileSync(this.fileName);
      this.toCache();
    } catch {
      // do nothing, it is possible that file has not been created yet.
    }
  }

  // Creates resource.
  protected async create(newContent?: ResourceContent) {
    if (pathExists(this.fileName)) {
      throw new Error(
        `Resource '${this.resourceName.identifier}' already exists in the project`,
      );
    }

    if (this.resourceFolder === '') {
      this.resourceName = resourceName(
        `${this.project.projectPrefix}/${this.type}/${this.resourceName.identifier}`,
      );
      this.resourceFolder = this.project.paths.resourcePath(
        this.resourceName.type as ResourceFolderType,
      );
    }

    const validName = await Validate.getInstance().validResourceName(
      this.resourceType(),
      resourceNameToString(this.resourceName),
      await this.project.projectPrefixes(),
    );

    let validContent = {} as ResourceContent;
    if (newContent) {
      validContent = newContent as unknown as ResourceContent;
      validContent.name = validName;
    }

    this.content = validContent;
    await this.write();

    // Notify project & collector
    this.project.addResource(
      this.resourceObjectToResource(this),
      this.content as unknown as JSON,
    );
  }

  // Calculations that use this resource.
  protected async calculations(): Promise<string[]> {
    const references: string[] = [];
    const resourceName = resourceNameToString(this.resourceName);
    for (const calculation of await this.project.calculations(
      ResourcesFrom.all,
    )) {
      const fileNameWithExtension = calculation.name.endsWith('.lp')
        ? calculation.name
        : calculation.name + '.lp';
      const filename = join(calculation.path, basename(fileNameWithExtension));
      try {
        const content = await readFile(filename, 'utf-8');
        if (content.includes(resourceName)) {
          references.push(calculation.name);
        }
      } catch (error) {
        throw new Error(
          `Failed to process file ${filename}: ${(error as Error).message}`,
        );
      }
    }
    return references;
  }

  // Cards from project.
  protected async cards(): Promise<Card[]> {
    return [
      ...(await this.project.cards(undefined, {
        content: true,
        metadata: true,
      })),
      ...(await this.project.allTemplateCards({
        content: true,
        metadata: true,
      })),
    ];
  }

  // Returns memory resident data as JSON.
  // This is basically same as 'show' but doesn't do any checks; just returns the current content.
  public get data() {
    return this.content.name !== '' ? this.content : undefined;
  }

  // Deletes resource.
  protected async delete() {
    if (this.moduleResource) {
      throw new Error(`Cannot delete module resources`);
    }
    if (!this.fileName.endsWith('.json')) {
      this.fileName += '.json';
    }
    if (!pathExists(this.fileName)) {
      throw new Error(
        `Resource '${this.resourceName.identifier}' does not exist in the project`,
      );
    }
    const usedIn = await this.usage();
    if (usedIn.length > 0) {
      throw new Error(
        `Cannot delete resource ${resourceNameToString(this.resourceName)}. It is used by: ${usedIn.join(', ')}`,
      );
    }
    await deleteFile(this.fileName);
    this.project.removeResource(this.resourceObjectToResource(this));
    this.fileName = '';
  }

  protected async validName(newName: ResourceName) {
    const validName = await Validate.getInstance().validResourceName(
      this.resourceType(),
      resourceNameToString(newName),
      await this.project.projectPrefixes(),
    );
    return validName;
  }

  // Called after inherited class has finished 'update' operation.
  protected async postUpdate<Type>(
    content: ResourceContent,
    key: string,
    op: Operation<Type>,
  ) {
    function toValue(op: Operation<Type>) {
      if (op.name === 'rank') return op.newIndex;
      if (op.name === 'add') return op.target;
      if (op.name === 'remove') return op.target;
      if (op.name === 'change') return op.to;
    }

    // Check that new name is valid.
    if (op.name === 'change' && key === 'name') {
      const newName = resourceName(
        (op as ChangeOperation<string>).to as string,
      );
      content.name = await this.validName(newName);
    }

    // Once changes have been made; validate the content.
    try {
      await this.validate(content);
    } catch (error) {
      if (error instanceof Error) {
        const errorValue = typeof op === 'object' ? toValue(op) : op;
        throw new Error(`Cannot ${op.name} '${key}' --> '${errorValue}'`);
      }
    }

    this.content = content;
    await this.write();
  }

  // Reads content from file to memory.
  protected async read() {
    this.content = await readJsonFile(this.fileName);
  }

  // Renames resource.
  protected async rename(newName: ResourceName) {
    this.cache.delete(resourceNameToString(this.resourceName));
    if (this.moduleResource) {
      throw new Error(`Cannot rename module resources`);
    }
    if (!pathExists(this.fileName)) {
      throw new Error(
        `Resource '${this.resourceName.identifier}' does not exist`,
      );
    }
    if (newName.prefix !== this.project.projectPrefix) {
      throw new Error('Can only rename project resources');
    }
    if (newName.type !== this.resourceName.type) {
      throw new Error('Cannot change resource type');
    }
    await Validate.getInstance().validResourceName(
      this.resourceType(),
      resourceNameToString(newName),
      await this.project.projectPrefixes(),
    );
    const newFilename = join(
      this.project.paths.resourcePath(newName.type as ResourceFolderType),
      newName.identifier + '.json',
    );
    await rename(this.fileName, newFilename);

    this.fileName = newFilename;
    this.content.name = resourceNameToString(newName);
    this.resourceName = newName;
    this.toCache();
  }

  // Show resource data as JSON.
  protected async show(): Promise<ResourceContent> {
    if (!pathExists(this.fileName)) {
      const resourceType = `${this.type[0].toUpperCase()}${this.type.slice(1, this.type.length - 1)}`;
      const name = resourceNameToString(this.resourceName);
      throw new Error(
        `${resourceType} '${name}' does not exist in the project`,
      );
    }
    return this.content as ResourceContent;
  }

  // Update resource; the base class makes some checks only.
  protected async update<Type>(
    key: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _op: Operation<Type>,
  ): Promise<void> {
    const content = this.data;
    if (!content) {
      throw new Error(`Resource '${this.fileName}' does not exist`);
    }
    if (this.moduleResource) {
      throw new Error(`Cannot update module resources`);
    }
    if (key === '' || key === undefined) {
      throw new Error(`Cannot update empty key`);
    }
  }

  // Updates resource key to a new prefix
  protected updatePrefixInResourceName(name: string, prefixes: string[]) {
    const { identifier, prefix, type } = resourceName(name);
    if (this.moduleResource) {
      return name;
    }
    return !prefixes.includes(prefix)
      ? `${this.project.configuration.cardKeyPrefix}/${type}/${identifier}`
      : name;
  }

  // Check if there are references to the resource in the card content.
  protected async usage(cards?: Card[]): Promise<string[]> {
    if (!pathExists(this.fileName)) {
      throw new Error(
        `Resource '${this.resourceName.identifier}' does not exist in the project`,
      );
    }
    const cardArray = cards?.length
      ? cards
      : await this.project.cards(undefined, {
          content: true,
          metadata: true,
        });

    return cardArray
      .filter((card) =>
        card.content?.includes(resourceNameToString(this.resourceName)),
      )
      .map((card) => card.key);
  }

  // Write the content from memory to disk.
  protected async write() {
    if (this.moduleResource) {
      throw new Error(`Cannot change module resources`);
    }

    // Create folder for resources and add correct .schema file.
    await mkdir(this.resourceFolder, { recursive: true });
    await writeJsonFile(
      join(this.resourceFolder, '.schema'),
      this.contentSchema,
      {
        flag: 'wx',
      },
    );
    // Check if "name" has changed. Changing "name" means renaming the file.
    const nameInContent = resourceName(this.content.name).identifier + '.json';
    const currentFileName = basename(this.fileName);

    if (nameInContent !== currentFileName) {
      const newFileName = join(this.resourceFolder, nameInContent);
      await rename(this.fileName, newFileName);
      this.fileName = newFileName;
    }

    await writeJsonFile(this.fileName, this.content);
    this.toCache();
  }

  // Validate that current memory-based 'content' is valid.
  protected async validate(content?: object) {
    const invalidJson = Validate.getInstance().validateJson(
      content ? content : this.content,
      this.contentSchemaId,
    );
    if (invalidJson.length) {
      throw new Error(`Invalid content JSON: ${invalidJson}`);
    }
  }
}
