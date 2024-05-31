// node
import { join } from 'path';
import { spawnSync } from 'child_process';

import type { metadataContent } from './interfaces/project-interfaces.js';
import { errorFunction } from './utils/log-utils.js';
import { homedir } from 'os';
import { Project } from './containers/project.js';
import { requestStatus } from './interfaces/request-status-interfaces.js';
import { UserPreferences } from './utils/user-preferences.js';

export class Edit {

    private static project: Project;

    constructor() { }

    /**
     * Opens the content and metadata files for a card in the code editor
     * @param projectPath - The path to the project containing the card
     * @param cardKey - The key of the card to open. Required.
     * @returns A response indicating success or error
     */
    public async editCard(projectPath: string, cardKey: string): Promise<requestStatus> {
        // Initialise the project
        Edit.project = new Project(projectPath);

        // Determine the card path
        const cardPath = Edit.project.pathToCard(cardKey);
        if (!cardPath) {
            return { statusCode: 400, message: `Card '${cardKey}' does not exist in the project` };
        }

        // Read the user preferences
        const prefs = new UserPreferences(join(homedir(), '.cyberismo', 'cards.prefs.json')).getPreferences();

        // Construct paths for the card components (json and adoc)
        const cardDirPath = join(Edit.project.cardrootFolder, cardPath);
        const cardContentPath = join(cardDirPath, Project.cardContentFile);
        const cardJsonPath = join(cardDirPath, Project.cardMetadataFile);

        // Extract the editor settings from the preferences.
        const editorPrefs = prefs.editCommand[process.platform];
        const editorCommand = editorPrefs.command;
        const editorArgPrefs: string[] = editorPrefs.args; // Coarces the args to string[] for map() below

        // Poor man's handlebars/moustache replacements
        const editorArgs = editorArgPrefs.map(arg => {
            arg = arg.replace(/\{\{\s*cardContentPath\s*\}\}/, cardContentPath);
            arg = arg.replace(/\{\{\s*cardJsonPath\s*\}\}/, cardJsonPath);
            arg = arg.replace(/\{\{\s*cardDirPath\s*\}\}/, cardDirPath);

            return arg;
        });

        // Execute the editor synchronously and set it to inherit the parent process stdio.
        // This enables terminal editors such as vim to grab the screen I/O
        // from the command line cards process.
        try {
            const result = spawnSync(editorCommand, editorArgs, {
                stdio: 'inherit'
            });

            if (result.status === null) {
                return { statusCode: 400, message: `Cannot launch editor: ${result.error}` };
            }
        } catch (error) {
            return { statusCode: 500, message: errorFunction(error) };
        }

        return { statusCode: 200 };
    }

    /**
     * Updates card content (index.adoc) with incoming content.
     * @param projectPath The path to the project containing the card
     * @param cardKey The card to update.
     * @param changedContent New content for the card.
     * @returns request status
     *       statusCode 200 when card was created successfully
     *  <br> statusCode 400 when card was not found
     *  <br> statusCode 400 when no content found (this API cannot be used to swipe away content)
     */
    public async editCardContent(projectPath: string, cardKey: string, changedContent: string): Promise<requestStatus> {
        Edit.project = new Project(projectPath);

        // Determine the card path
        const cardPath = Edit.project.pathToCard(cardKey);
        if (!cardPath) {
            return { statusCode: 400, message: `Card '${cardKey}' does not exist in the project` };
        }

        return Edit.project.updateCardContent(cardKey, changedContent);
    }

    /**
     * Updates card metadata.
     * @param projectPath The path to the project containing the card
     * @param cardKey The card to update
     * @param changedKey Which metadata property was changed
     * @param newValue New value for the metadata property
     *       statusCode 200 when card was created successfully
     *  <br> statusCode 400 when card was not found
     */
    public async editCardMetadata(projectPath: string, cardKey: string, changedKey: string, newValue: metadataContent) {
        Edit.project = new Project(projectPath);

        // Determine the card path
        const cardPath = Edit.project.pathToCard(cardKey);
        if (!cardPath) {
            return { statusCode: 400, message: `Card '${cardKey}' does not exist in the project` };
        }
        if (!changedKey) {
            return { statusCode: 400, message: `Changed key cannot be empty` };
        }
        return Edit.project.updateCardMetadata(cardKey, changedKey, newValue);
    }
}