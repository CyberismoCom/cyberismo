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
import { join } from 'node:path';
import { homedir } from 'node:os';
import { spawnSync } from 'node:child_process';

import { ActionGuard } from '../permissions/action-guard.js';
import { Project } from '../containers/project.js';
import { UserPreferences } from '../utils/user-preferences.js';
import { write } from '../utils/rw-lock.js';

import type { MetadataContent } from '../interfaces/project-interfaces.js';

export class Edit {
  private project: Project;

  constructor(project: Project) {
    this.project = project;
  }

  /**
   * Opens the content and metadata files for a card in the code editor
   * @param cardKey - The key of the card to open. Required.
   */
  public editCard(cardKey: string) {
    const card = this.project.findCard(cardKey);

    // Read the user preferences
    const prefs = new UserPreferences(
      join(homedir(), '.cyberismo', 'cards.prefs.json'),
    ).getPreferences();

    // Construct paths for the card components (json and adoc)
    const cardContentPath = join(card.path, Project.cardContentFile);
    const cardJsonPath = join(card.path, Project.cardMetadataFile);

    // Extract the editor settings from the preferences.
    const editorPrefs = prefs.editCommand[process.platform];
    const editorCommand = editorPrefs.command;
    const editorArgPrefs: string[] = editorPrefs.args; // Coarces the args to string[] for map() below

    // Poor man's handlebars/moustache replacements
    const editorArgs = editorArgPrefs.map((arg) => {
      arg = arg.replace(/\{\{\s*cardContentPath\s*\}\}/, cardContentPath);
      arg = arg.replace(/\{\{\s*cardJsonPath\s*\}\}/, cardJsonPath);
      arg = arg.replace(/\{\{\s*cardDirPath\s*\}\}/, card.path);

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
  @write((cardKey) => `Edit content of ${cardKey}`)
  public async editCardContent(cardKey: string, changedContent: string) {
    if (this.project.hasTemplateCard(cardKey)) {
      return this.project.updateCardContent(cardKey, changedContent);
    }
    if (this.project.findCard(cardKey)) {
      const actionGuard = new ActionGuard(this.project.calculationEngine);
      await actionGuard.checkPermission('editContent', cardKey);
      await this.project.updateCardContent(cardKey, changedContent);
    }
  }

  /**
   * Updates card metadata.
   * @param cardKey The card to update
   * @param changedKey Which metadata property was changed
   * @param newValue New value for the metadata property
   */
  @write((cardKey) => `Edit metadata of ${cardKey}`)
  public async editCardMetadata(
    cardKey: string,
    changedKey: string,
    newValue: MetadataContent,
  ) {
    if (!changedKey) {
      throw new Error(`Changed key cannot be empty`);
    }
    if (this.project.hasTemplateCard(cardKey)) {
      return this.project.updateCardMetadataKey(cardKey, changedKey, newValue);
    }

    // check for editing rights
    if (this.project.findCard(cardKey)) {
      const actionGuard = new ActionGuard(this.project.calculationEngine);
      await actionGuard.checkPermission('editField', cardKey, changedKey);
      await this.project.updateCardMetadataKey(cardKey, changedKey, newValue);
    }
  }
}
