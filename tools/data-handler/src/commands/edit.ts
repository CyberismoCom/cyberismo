/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

// node
import { join } from 'node:path';
import { homedir } from 'node:os';
import { spawnSync } from 'node:child_process';

import { ActionGuard } from '../permissions/action-guard.js';
import type {
  MetadataContent,
  ResourceFolderType,
} from '../interfaces/project-interfaces.js';
import { Project } from '../containers/project.js';
import { UserPreferences } from '../utils/user-preferences.js';
import {
  type ResourceName,
  resourceNameToString,
} from '../utils/resource-utils.js';
import { FolderResource } from '../resources/folder-resource.js';
import { CalculationResource } from '../resources/calculation-resource.js';

export class Edit {
  private project: Project;

  constructor(project: Project) {
    this.project = project;
  }

  /**
   * Updates a calculation file.
   * @param resourceName The name of the resource to update.
   * @param changedContent The new content for the calculation.
   */
  public async editCalculation(
    resourceName: ResourceName,
    changedContent: string,
  ) {
    if (resourceName.prefix !== this.project.projectPrefix) {
      throw new Error(
        `Resource '${resourceName.identifier}' is not a local resource`,
      );
    }
    const resourceNameString = resourceNameToString(resourceName);
    if (
      !(await this.project.resourceExists(
        resourceName.type as ResourceFolderType,
        resourceNameString,
      ))
    ) {
      throw new Error(
        `Resource '${resourceNameString}' does not exist in the project`,
      );
    }

    const calculationResource = new CalculationResource(
      this.project,
      resourceName,
    );
    await calculationResource.updateCalculationContent(changedContent);
  }

  /**
   * Opens the content and metadata files for a card in the code editor
   * @param cardKey - The key of the card to open. Required.
   */
  public async editCard(cardKey: string) {
    // Determine the card path
    const cardPath = this.project.pathToCard(cardKey);
    if (!cardPath) {
      throw new Error(`Card '${cardKey}' does not exist in the project`);
    }

    // Read the user preferences
    const prefs = new UserPreferences(
      join(homedir(), '.cyberismo', 'cards.prefs.json'),
    ).getPreferences();

    // Construct paths for the card components (json and adoc)
    const cardDirPath = join(this.project.paths.cardRootFolder, cardPath);
    const cardContentPath = join(cardDirPath, Project.cardContentFile);
    const cardJsonPath = join(cardDirPath, Project.cardMetadataFile);

    // Extract the editor settings from the preferences.
    const editorPrefs = prefs.editCommand[process.platform];
    const editorCommand = editorPrefs.command;
    const editorArgPrefs: string[] = editorPrefs.args; // Coarces the args to string[] for map() below

    // Poor man's handlebars/moustache replacements
    const editorArgs = editorArgPrefs.map((arg) => {
      arg = arg.replace(/\{\{\s*cardContentPath\s*\}\}/, cardContentPath);
      arg = arg.replace(/\{\{\s*cardJsonPath\s*\}\}/, cardJsonPath);
      arg = arg.replace(/\{\{\s*cardDirPath\s*\}\}/, cardDirPath);

      return arg;
    });

    // Execute the editor synchronously and set it to inherit the parent process stdio.
    // This enables terminal editors such as vim to grab the screen I/O
    // from the command line cards process.
    const result = spawnSync(editorCommand, editorArgs, {
      stdio: 'inherit',
    });

    if (result.status === null) {
      throw new Error(`Cannot launch editor: ${result.error}`);
    }
  }

  /**
   * Updates card content (index.adoc) with incoming content.
   * @param cardKey The card to update.
   * @param changedContent New content for the card.
   */
  public async editCardContent(cardKey: string, changedContent: string) {
    const isTemplateCard = await this.project.isTemplateCard(cardKey);
    if (isTemplateCard) {
      return this.project.updateCardContent(cardKey, changedContent);
    }
    const cardPath = this.project.pathToCard(cardKey);
    if (!cardPath) {
      throw new Error(`Card '${cardKey}' does not exist in the project`);
    }

    const actionGuard = new ActionGuard(this.project.calculationEngine);
    await actionGuard.checkPermission('editContent', cardKey);

    await this.project.updateCardContent(cardKey, changedContent);
  }

  /**
   * Updates card metadata.
   * @param cardKey The card to update
   * @param changedKey Which metadata property was changed
   * @param newValue New value for the metadata property
   */
  public async editCardMetadata(
    cardKey: string,
    changedKey: string,
    newValue: MetadataContent,
  ) {
    if (!changedKey) {
      throw new Error(`Changed key cannot be empty`);
    }
    const isTemplateCard = await this.project.isTemplateCard(cardKey);
    if (isTemplateCard) {
      return this.project.updateCardMetadataKey(cardKey, changedKey, newValue);
    }

    // Determine the card path
    const cardPath = this.project.pathToCard(cardKey);
    if (!cardPath) {
      throw new Error(`Card '${cardKey}' does not exist in the project`);
    }

    // check for editing rights
    const actionGuard = new ActionGuard(this.project.calculationEngine);
    await actionGuard.checkPermission('editField', cardKey, changedKey);
    await this.project.updateCardMetadataKey(cardKey, changedKey, newValue);
  }

  /**
   * Update a file of a folder resource. Cannot be used to create a new file.
   * @param resourceName The name of the resource to update.
   * @param fileName The name of the file to update.
   * @param changedContent The new content for the file.
   */
  public async editResourceContent(
    resourceName: ResourceName,
    fileName: string,
    changedContent: string,
  ) {
    const resourceNameString = resourceNameToString(resourceName);
    if (
      !(await this.project.resourceExists(
        resourceName.type as ResourceFolderType,
        resourceNameString,
      ))
    ) {
      throw new Error(
        `Resource '${resourceNameString}' does not exist in the project`,
      );
    }
    const resource = Project.resourceObject(this.project, resourceName);
    if (!(resource instanceof FolderResource)) {
      throw new Error(
        `Resource '${resourceNameString}' is not a folder resource`,
      );
    }
    return resource.updateFile(fileName, changedContent);
  }
}
