// node
import { EventEmitter } from 'node:events';
import { join, sep } from 'node:path';

// ismo
import { Calculate } from './calculate.js';
import { deleteDir, deleteFile } from './utils/file-utils.js'
import { Project } from './containers/project.js';
import { requestStatus } from './interfaces/request-status-interfaces.js';

export class Remove extends EventEmitter {
    static project: Project;

    private calculateCmd: Calculate;

    constructor(calculateCmd: Calculate) {
        super();
        this.calculateCmd = calculateCmd;
        this.addListener(
            'removed',
            this.calculateCmd.handleDeleteCard.bind(this.calculateCmd));
    }

    // Removes attachment from template or project card
    private async removeAttachment(cardKey: string, attachment?: string): Promise<requestStatus> {
        if (!attachment) {
            return { statusCode: 400, message: `Attachment filename required` };
        }

        const attachmentFolder = await Remove.project.cardAttachmentFolder(cardKey);
        if (!attachmentFolder) {
            return { statusCode: 400, message: `Card '${cardKey}' not found` };
        }

        // Imported templates cannot be modified.
        if (attachmentFolder.includes(`${sep}modules${sep}`)) {
            return { statusCode: 400, message: `Cannot modify imported module` };
        }

        // Attachment's reside in 'a' folders.
        const success = await deleteFile(join(attachmentFolder, attachment));
        return success
            ? { statusCode: 200 }
            : { statusCode: 500, message: 'No such file' };
    }

    // Removes card from project or template
    private async removeCard(cardKey: string): Promise<requestStatus> {
        const cardFolder = await Remove.project.cardFolder(cardKey);
        if (!cardFolder) {
            return { statusCode: 400, message: `Card '${cardKey}' not found` };
        }

        // Imported templates cannot be modified.
        if (cardFolder.includes(`${sep}modules${sep}`)) {
            return { statusCode: 400, message: `Cannot modify imported module` };
        }

        // Calculations need to be updated before card is removed.
        const card = await Remove.project.findSpecificCard(cardKey);
        if (card) {
            this.emit('removed', card);
        }
        await deleteDir(cardFolder);
        return { statusCode: 200 }
    }

    // Removes modules from project
    private async removeModule(moduleName: string): Promise<requestStatus> {
        const module = await Remove.project.modulePath(moduleName);
        if (!module) {
            return { statusCode: 400, message: `Module '${moduleName}' not found` };
        }
        await deleteDir(module);
        return { statusCode: 200 };
    }

    // Removes template from project
    private async removeTemplate(templateName: string): Promise<requestStatus> {
        const template = await Remove.project.template(templateName);
        if (!template || !template.path) {
            return {
                statusCode: 400,
                message: `Template '${templateName}' does not exist in the project`
            };
        }

        const templatePath = join(template.path, template.name);

        // Imported templates cannot be modified.
        if (templatePath.includes(`${sep}modules${sep}`)) {
            return { statusCode: 400, message: `Cannot modify imported module` };
        }

        await deleteDir(templatePath);
        return { statusCode: 200 };
    }

    /**
     * Removes either attachment, card or template from project.
     * @param {string} projectPath Path to a project
     * @param {string} targetName Card id, or template name
     * @param {string} attachmentName attachment name; optional
     * @param {string} templateName template name; optional
     * @returns request status
     *       statusCode 200 when target was removed successfully
     *  <br> statusCode 400 when input validation failed
     *  <br> statusCode 500 when unknown error happened
     */
    public async remove(projectPath: string, type: string, targetName: string, attachmentName?: string): Promise<requestStatus> {
        Remove.project = new Project(projectPath);
        switch (type) {
            case 'attachment':
                return this.removeAttachment(targetName, attachmentName);
            case 'card':
                return this.removeCard(targetName);
            case 'module':
                return this.removeModule(targetName);
            case 'template':
                return this.removeTemplate(targetName);
            default:
                return { statusCode: 400, message: `Invalid type '${type}'` };
        }
    }
}