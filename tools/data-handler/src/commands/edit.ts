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

import { Checkout } from '../containers/project.js';
import { UserPreferences } from '../utils/user-preferences.js';
import { read, write } from '../utils/rw-lock.js';

export class Edit {
  private checkout: Checkout;

  constructor(checkout: Checkout) {
    this.checkout = checkout;
  }

  /**
   * Opens the content and metadata files for a card in the code editor
   * @param cardKey - The key of the card to open. Required.
   */
  @read
  public async editCard(cardKey: string) {
    const card = this.checkout.findCard(cardKey);

    // Read the user preferences
    const prefs = new UserPreferences(
      join(homedir(), '.cyberismo', 'cards.prefs.json'),
    ).getPreferences();

    // Construct paths for the card components (json and adoc)
    const cardContentPath = join(card.path, Checkout.cardContentFile);
    const cardJsonPath = join(card.path, Checkout.cardMetadataFile);

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
   * Sets the git remote URL for the project.
   * @param url The remote URL to set.
   */
  @write(() => 'Set git remote URL')
  public async setGitRemoteUrl(url: string): Promise<void> {
    await this.checkout.git.setRemoteUrl(url);
  }
}
