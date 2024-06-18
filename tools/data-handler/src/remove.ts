// node
import { EventEmitter } from 'node:events';
import { join, sep } from 'node:path';

// ismo
import { Calculate } from './calculate.js';
import { deleteDir, deleteFile } from './utils/file-utils.js'
import { Project } from './containers/project.js';

export class Remove extends EventEmitter {
    static project: Project;

    private calculateCmd: Calculate;

    constructor(calculateCmd: Calculate) {
        super();
        this.calculateCmd = calculateCmd;
    }

    // Removes attachment from template or project card
    private async removeAttachment(cardKey: string, attachment?: string) {
        if (!attachment) {
            throw new Error(`Attachment filename required`);
        }

        const attachmentFolder = await Remove.project.cardAttachmentFolder(cardKey);
        if (!attachmentFolder) {
            throw new Error(`Card '${cardKey}' not found`);
        }

        // Imported templates cannot be modified.
        if (attachmentFolder.includes(`${sep}modules${sep}`)) {
            throw new Error(`Cannot modify imported module`);
        }

        // Attachment's reside in 'a' folders.
        const success = await deleteFile(join(attachmentFolder, attachment));
        if (!success) {
            throw new Error('No such file');
        }
    }

    // Removes card from project or template
    private async removeCard(cardKey: string) {
      const cardFolder = await Remove.project.cardFolder(cardKey);
      if (!cardFolder) {
        throw new Error(`Card '${cardKey}' not found`);
      }

      // Imported templates cannot be modified.
      if (cardFolder.includes(`${sep}modules${sep}`)) {
        throw new Error(`Cannot modify imported module`);
      }

      // Calculations need to be updated before card is removed.
      const card = await Remove.project.findSpecificCard(cardKey);
      if (card) {
        await this.calculateCmd.handleDeleteCard(card);
      }
      await deleteDir(cardFolder);

      if (card) {
        this.emit("removed", card);
      }
    }

    // Removes modules from project
    private async removeModule(moduleName: string) {
        const module = await Remove.project.modulePath(moduleName);
        if (!module) {
            throw new Error(`Module '${moduleName}' not found`);
        }
        await deleteDir(module);
    }

    // Removes template from project
    private async removeTemplate(templateName: string) {
        const template = await Remove.project.template(templateName);
        if (!template || !template.path) {
            throw new Error(`Template '${templateName}' does not exist in the project`);
        }

        const templatePath = join(template.path, template.name);

        // Imported templates cannot be modified.
        if (templatePath.includes(`${sep}modules${sep}`)) {
            throw new Error(`Cannot modify imported module`);
        }

        await deleteDir(templatePath);
    }

    /**
     * Removes either attachment, card or template from project.
     * @param {string} projectPath Path to a project
     * @param {string} targetName Card id, or template name
     * @param {string} attachmentName attachment name; optional
     * @param {string} templateName template name; optional
     */
    public async remove(projectPath: string, type: string, targetName: string, attachmentName?: string) {
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
                throw new Error(`Invalid type '${type}'`);
        }
    }
}