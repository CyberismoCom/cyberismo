// node
import { EventEmitter } from 'node:events';
import { join } from 'node:path';
import { rename, writeFile } from 'node:fs/promises';

// ismo
import { Calculate } from './calculate.js';
import { card } from './interfaces/project-interfaces.js';
import { Project } from './containers/project.js';
import { requestStatus } from './interfaces/request-status-interfaces.js';
import { Template } from './containers/template.js';

export class Rename extends EventEmitter {
    static project: Project;

    private calculateCmd: Calculate;

    constructor(calculateCmd: Calculate) {
        super();
        this.calculateCmd = calculateCmd;
        this.addListener(
            'renamed',
            this.calculateCmd.generate.bind(this.calculateCmd));
    }

    // Sort cards by path length (so that renaming starts from children)
    private sortCards(a: card, b: card) {
        if (a.path.length > b.path.length) {
            return -1;
        }
        if (a.path.length < b.path.length) {
            return 1;
        }
        return 0;
    }

    // Helper that renames a card and all of its attachments (if it is a non-template card).
    private async replaceCardPath(re: RegExp, to: string, card: card): Promise<string> {
        const newCardPath = card.path.replace(re, to);

        // First rename attachments (and fix references from content to the attachments).
        if (!Project.isTemplateCard(card)) {
            const attachments = card.attachments ? card.attachments : [];
            await Promise.all(attachments.map(async attachment => {
                const newAttachmentFileName = attachment.fileName.replace(re, to);
                await rename(join(attachment.path, attachment.fileName), join(attachment.path, newAttachmentFileName));

                const contentRe = new RegExp(`image::${attachment.fileName}`, 'g');
                card.content = card.content?.replace(contentRe, `image::${newAttachmentFileName}`);
                await writeFile(join(card.path, 'index.adoc'), card.content || '');
            }));
        }

        // Then, rename the card file.
        await rename(card.path, newCardPath);
        return newCardPath;
    }

    /**
     * Renames project prefix.
     * @param {string} projectPath Path to a project
     * @param {string} to Card id, or template name
     * @returns request status
     *       statusCode 200 when target was removed successfully
     *  <br> statusCode 400 when input validation failed
     */
    public async rename(projectPath: string, to: string): Promise<requestStatus> {
        Rename.project = new Project(projectPath);
        const from = Rename.project.configuration.cardkeyPrefix;
        // Ensure that only last occurrence is replaced, since path can contain "project prefixes" that are not to be touched.
        //   E.g. /Users/matti/projects/card-projects/matti-project/cardroot/matti_1; change 'matti' cardkey to 'teppo'
        //   --> only the last 'matti' should be replaced with 'teppo'.
        const re = new RegExp(`${from}(?!.*${from})`);

        // First change project prefix to project settings.
        const valid = Rename.project.configuration.setCardPrefix(to);
        if (valid.statusCode !== 200) {
            return valid;
        }

        // Then rename all project cards. Sort cards so that cards that deeper in file hierarchy are renamed first.
        const projectCards = (await Rename.project.cards())
            .sort((a, b) => {
                return this.sortCards(a, b);
            });

        // Cannot do this parallel, since cards deeper in the hierarchy needs to be renamed first.
        for (const card of projectCards) {
            await this.replaceCardPath(re, to, card);
        }

        // Then rename all local template cards. Module templates are not to be modified.
        // Sort cards so that cards that deeper in file hierarchy are renamed first.
        const templates = await Rename.project.templates(true);
        for (const template of templates) {
            const templateObject = new Template(projectPath, template, Rename.project);
            const templateCards = (await templateObject.cards())
                .sort((a, b) => {
                    return this.sortCards(a, b);
                });

            // Cannot do this parallel, since cards deeper in the hierarchy needs to be renamed first.
            for (const card of templateCards) {
                await this.replaceCardPath(re, to, card);
            }
        }

        this.emit('renamed', Rename.project.basePath);
        return { statusCode: 200, message: `Project prefix changed from '${from}' to '${to}'` };
    }
}