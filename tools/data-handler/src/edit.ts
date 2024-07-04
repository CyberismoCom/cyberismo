// node
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

import type { metadataContent } from './interfaces/project-interfaces.js';
import { homedir } from 'os';
import { Project } from './containers/project.js';
import { UserPreferences } from './utils/user-preferences.js';

export class Edit {
  private static project: Project;

  constructor() {}

  /**
   * Opens the content and metadata files for a card in the code editor
   * @param projectPath - The path to the project containing the card
   * @param cardKey - The key of the card to open. Required.
   */
  public async editCard(projectPath: string, cardKey: string) {
    // Initialise the project
    Edit.project = new Project(projectPath);

    // Determine the card path
    const cardPath = Edit.project.pathToCard(cardKey);
    if (!cardPath) {
      throw new Error(`Card '${cardKey}' does not exist in the project`);
    }

    // Read the user preferences
    const prefs = new UserPreferences(
      join(homedir(), '.cyberismo', 'cards.prefs.json'),
    ).getPreferences();

    // Construct paths for the card components (json and adoc)
    const cardDirPath = join(Edit.project.cardrootFolder, cardPath);
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
   * @param projectPath The path to the project containing the card
   * @param cardKey The card to update.
   * @param changedContent New content for the card.
   */
  public async editCardContent(
    projectPath: string,
    cardKey: string,
    changedContent: string,
  ) {
    Edit.project = new Project(projectPath);

    // Determine the card path
    const cardPath = Edit.project.pathToCard(cardKey);
    if (!cardPath) {
      throw new Error(`Card '${cardKey}' does not exist in the project`);
    }

    await Edit.project.updateCardContent(cardKey, changedContent);
  }

  /**
   * Updates card metadata.
   * @param projectPath The path to the project containing the card
   * @param cardKey The card to update
   * @param changedKey Which metadata property was changed
   * @param newValue New value for the metadata property
   */
  public async editCardMetadata(
    projectPath: string,
    cardKey: string,
    changedKey: string,
    newValue: metadataContent,
  ) {
    Edit.project = new Project(projectPath);

    // Determine the card path
    const cardPath = Edit.project.pathToCard(cardKey);
    if (!cardPath) {
      throw new Error(`Card '${cardKey}' does not exist in the project`);
    }
    if (!changedKey) {
      throw new Error(`Changed key cannot be empty`);
    }
    await Edit.project.updateCardMetadata(cardKey, changedKey, newValue);
  }
}
