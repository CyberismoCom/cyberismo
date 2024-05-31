import { basename, dirname, join, resolve } from 'node:path';
import { execSync } from 'node:child_process';

import { Calculate } from './calculate.js';
import { Create } from './create.js';
import { Edit } from './edit.js';
import { ExportSite } from './export-site.js';
import { Import } from './import.js';
import { Move } from './move.js';
import { pathExists, resolveTilde, sepRegex } from './utils/file-utils.js';
import { Project } from './containers/project.js';
import { Remove } from './remove.js';
import { Rename } from './rename.js';
import { requestStatus } from './interfaces/request-status-interfaces.js';
import { Show } from './show.js';
import { Transition } from './transition.js';
import { Validate } from './validate.js';
import { fileURLToPath } from 'node:url';

const invalidNames = new RegExp('[<>:"/\\|?*\x00-\x1F]|^(?:aux|con|clock$|nul|prn|com[1-9]|lpt[1-9])$'); // eslint-disable-line no-control-regex

// Generic options interface
export interface CardsOptions {
    details?: boolean,
    format?: string,
    output?: string,
    projectPath?: string,
    repeat?: number,
}

/**
 * Class that handles all commands.
 */
export class Commands {

    private calcCmd: Calculate;
    private createCmd: Create;
    private editCmd: Edit;
    private exportCmd: ExportSite;
    private importCmd: Import;
    private moveCmd: Move;
    private removeCmd: Remove;
    private renameCmd: Rename;
    private showCmd: Show;
    private transitionCmd: Transition;
    private validateCmd: Validate;

    constructor() {
        this.calcCmd = new Calculate();
        this.createCmd = new Create(this.calcCmd);
        this.editCmd = new Edit();
        this.exportCmd = new ExportSite();
        this.importCmd = new Import();
        this.moveCmd = new Move();
        this.removeCmd = new Remove(this.calcCmd);
        this.renameCmd = new Rename(this.calcCmd);
        this.showCmd = new Show();
        this.transitionCmd = new Transition(this.calcCmd);
        this.validateCmd = Validate.getInstance();
    }

    public static allowedTypes = [
        'attachment',
        'card',
        'cardtype',
        'fieldtype',
        'module',
        'project',
        'template',
        'workflow'
    ];

    public static removableTypes = this.allowedTypes
        .filter(item =>
            item === 'attachment' ||
            item === 'card' ||
            item === 'module' ||
            item === 'template'
        );

    // Lists all allowed resource types.
    public allAllowedTypes(): string[] {
        return [
            ...this.pluralizeTypes(),
            ...Commands.allowedTypes
        ].sort();
    }

    // Checks if card exists in project or template.
    private async cardExists(path: string, cardKey?: string): Promise<boolean> {
        if (cardKey) {
            const project = new Project(path);
            const card = await project.findSpecificCard(cardKey);
            return !!card;
        }
        return false;
    }

    // Pluralizes allowed target types.
    // Note that this is english only and does not support exceptions (e.g. datum -> data).
    private pluralizeTypes(): string[] {
        const retArray = [];
        retArray.push(...Commands.allowedTypes.map(item => item += 's'));
        return retArray;
    }

    // Sets project path, if running operation within project folder.
    private async setProjectPath(path?: string): Promise<string> {
        if (!path) {
            path = await Project.findProjectRoot(process.cwd());
            if (path === '') {
                throw new Error('Unknown path');
                /*
                // when sinon is used for testing, use this instead. Otherwise, cannot have unit tests that cause process exit.
                console.error('No path defined - exiting');
                process.exit(1);
                */
            }
        }

        if (this.isProjectPath(path)) {
            return path;
        } else {
            console.error(`invalid path '${path}'`);
            return '';
        }
    }

    // Check that path is a project path
    private isProjectPath(path: string) {
        const cardsPath = resolve(join(path, '.cards'));
        const cardrootPath = resolve(join(path, 'cardroot'));
        return pathExists(cardsPath)
            && pathExists(cardrootPath);
    }

    // Validates folder name
    private validateFolder(path: string): boolean {
        if (path === '' || path === '.' || path === '..') {
            return false;
        }
        return !invalidNames.test(basename(path));
    }

    // Validates a resource name.
    private validateName(name: string) {
        // Common names might have 'local' in the beginning before the actual name.
        const parts = name.split(sepRegex);
        if ((parts.length === 2 && parts[0] !== 'local') || parts.length > 2) {
            return false;
        }
        if (parts.length === 2) {
            name = parts[1];
        }

        const validName = new RegExp('^[A-Za-z ._-]+$');
        const contentValidated = validName.test(name);
        const lengthValidated = name.length > 0 && name.length < 256;
        return contentValidated && lengthValidated;
    }

    // Validates project prefix.
    private validatePrefix(prefix: string) {
        const validPrefix = new RegExp('^[a-z]+$');
        const contentValidated = validPrefix.test(prefix);
        const lengthValidated = prefix.length > 2 && prefix.length < 11;
        return contentValidated && lengthValidated;
    }

    /**
     *  Adds a new card to a template.
     * @param {string} templateName Name of a template.
     * @param {string} cardTypeName Card-type for the new card.
     * @param {string} cardKey Optional, parent cardKey, if any. If omitted, the new card will be created to root level.
     * @param {string} path Optional, path to the project. If omitted, project is set from current path.
     * @returns {requestStatus}
     *       statusCode 200 when operation succeeded
     *  <br> statusCode 400 when input validation failed
     */
    public async addCard(templateName: string, cardTypeName: string, cardKey?: string, path?: string, repeat?: number): Promise<requestStatus> {
        path = await this.setProjectPath(path);
        if (!this.validateFolder(path)) {
            return {
                statusCode: 400,
                message: `Input validation error: folder name is invalid '${path}'`
            };
        }
        if (!pathExists(path)) {
            return {
                statusCode: 400,
                message: `Input validation error: cannot find project '${path}'`
            };
        }
        const templateFolder = join(path, templateName);
        if (!templateName || !this.validateFolder(templateFolder)) {
            return {
                statusCode: 400,
                message: `Input validation error: template name is invalid '${templateName}'`
            };
        }
        if (cardTypeName === undefined) {
            return {
                statusCode: 400,
                message: `Input validation error: cardtype cannot be empty`
            };
        }
        return this.createCmd.addCards(path, cardTypeName, templateName, cardKey, repeat);
    }

    /**
     * Calculate logic program.
     * @param command Specific calculate command to execute. Supported values: generate, run
     * @param options Options for the command. See below.
     * @param cardKey Optional, parent cardKey, if any. If omitted, the calculations will be done for the whole card-tree.
     * @details Options can contain two command specific options:
     *          grounding - (description omitted)
     *          solving - (description omitted)
     * @returns {requestStatus}
     *       statusCode 200 when operation succeeded
     *  <br> statusCode 400 when input validation failed
     */
    public async calculate(command: string, options?: CardsOptions, cardKey?: string): Promise<requestStatus> {
        const path = await this.setProjectPath(options?.projectPath);
        if (!this.validateFolder(path)) {
            return {
                statusCode: 400,
                message: `Input validation error: folder name is invalid '${path}'`
            };
        }
        if (!pathExists(path)) {
            return {
                statusCode: 400,
                message: `Input validation error: cannot find project '${path}'`
            };
        }
        if (command === 'generate') {
            return this.calcCmd.generate(path, cardKey);
        } else if (command === 'run') {
            if (!cardKey) {
                return { statusCode: 400, message: `"${command}" requires cardkey` };
            }
            return this.calcCmd.run(path, cardKey);
        }
        return { statusCode: 400, message: `Invalid command for calculation ${command}` };
    }

    /**
     * Adds attachment to a card.
     * @param {string} cardKey card key
     * @param {string} attachment path to attachment
     * @param {string} path Optional, path to the project. If omitted, project is set from current path.
     * @returns {requestStatus}
     *       statusCode 200 when operation succeeded
     *  <br> statusCode 400 when input validation failed
     *  <br> statusCode 500 when there was a internal problem creating attachment
     */
    public async createAttachment(cardKey: string, attachment: string, path?: string): Promise<requestStatus> {
        path = await this.setProjectPath(path);
        if (!this.validateFolder(path)) {
            return {
                statusCode: 400,
                message: `Input validation error: folder name is invalid '${path}'`
            };
        }
        if (!pathExists(path)) {
            return {
                statusCode: 400,
                message: `Input validation error: cannot find project '${path}'`
            };
        }
        if (!pathExists(attachment)) {
            return {
                statusCode: 400,
                message: `Input validation error: cannot find attachment '${attachment}'`
            };
        }
        return this.createCmd.createAttachment(cardKey, path, attachment);
    }

    /**
     * Creates a new card to a project, or to a template.
     * @param {string} templateName which template to use
     * @param {string} parentCardKey parent for the new card
     * @param {string} path Optional, path to the project. If omitted, project is set from current path.
     * @returns {requestStatus}
     *       statusCode 200 when operation succeeded
     *  <br> statusCode 400 when input validation failed
     *  <br> statusCode 500 when there was a internal problem creating card
     */
    public async createCard(templateName: string, parentCardKey?: string, path?: string): Promise<requestStatus> {
        // console.log(`t: ${template}, p: ${parentCardKey}, path: ${path}`);
        path = await this.setProjectPath(path);
        if (!this.validateFolder(path)) {
            return {
                statusCode: 400,
                message: `Input validation error: folder name is invalid '${path}'`
            };
        }
        if (!pathExists(path)) {
            return {
                statusCode: 400,
                message: `Input validation error: cannot find project '${path}'`
            };
        }
        if (parentCardKey === undefined) {
            parentCardKey = '';
        }
        return this.createCmd.createCard(path, templateName, parentCardKey);
    }

    /**
     * Creates a new cardtype.
     * @param {string} cardTypeName Name of the cardtype.
     * @param {string} workflowName Name of the workflow that the cardtype uses.
     * @param {string} path Optional, path to the project. If omitted, project is set from current path.
     * @returns {requestStatus}
     *       statusCode 200 when operation succeeded
     *  <br> statusCode 400 when input validation failed
     *  <br> statusCode 500 when there was a internal problem creating cardtype
     */
    public async createCardtype(cardTypeName: string, workflowName: string, path?: string): Promise<requestStatus> {
        path = await this.setProjectPath(path);
        if (!this.validateFolder(path)) {
            return {
                statusCode: 400,
                message: `Input validation error: folder name is invalid '${path}'`
            };
        }
        if (!pathExists(path)) {
            return {
                statusCode: 400,
                message: `Input validation error: cannot find project '${path}'`
            };
        }
        if (!this.validateName(cardTypeName)) {
            return {
                statusCode: 400,
                message: `Input validation error: invalid cardtype name '${cardTypeName}'`
            };
        }
        if (!this.validateName(workflowName)) {
            return {
                statusCode: 400,
                message: `Input validation error: invalid workflow name '${workflowName}'`
            };
        }
        return this.createCmd.createCardtype(path, cardTypeName, workflowName);
    }

    /**
     * Creates a new fieldtype.
     * @param {string} fieldTypeName Name of the fieldtype.
     * * @param {string} dataType Name of the fieldtype.
     * @param {string} path Optional, path to the project. If omitted, project is set from current path.
     * @returns {requestStatus}
     *       statusCode 200 when operation succeeded
     *  <br> statusCode 400 when input validation failed
     *  <br> statusCode 500 when there was a internal problem creating fieldtype
     */
    public async createFieldType(fieldTypeName: string, dataType: string, path?: string): Promise<requestStatus> {
        path = await this.setProjectPath(path);
        if (!this.validateFolder(path)) {
            return {
                statusCode: 400,
                message: `Input validation error: folder name is invalid '${path}'`
            };
        }
        if (!pathExists(path)) {
            return {
                statusCode: 400,
                message: `Input validation error: cannot find project '${path}'`
            };
        }
        if (!this.validateName(fieldTypeName)) {
            return {
                statusCode: 400,
                message: `Input validation error: invalid fieldtype name '${fieldTypeName}'`
            };
        }
        return this.createCmd.createFieldType(path, fieldTypeName, dataType);
    }

    /**
     * Creates a new project.
     * @param {string} path Project path
     * @param {string} prefix Card prefix
     * @param {string} projectName Project name
     * @returns {requestStatus}
     *       statusCode 200 when operation succeeded
     *  <br> statusCode 400 when input validation failed
     *  <br> statusCode 500 when there was a internal problem creating project
     */
    public async createProject(path: string, prefix: string, projectName: string): Promise<requestStatus> {
        // console.log(`path: ${path} prefix: ${prefix}, name: ${projectName}`)
        path = resolveTilde(path)
        if (pathExists(path)) {
            return { statusCode: 400, message: `Project already exists '${path}'` };
        }
        if (!this.validateFolder(path)) {
            return { statusCode: 400, message: `Input validation error: folder name is invalid '${path}'` };
        }
        if (prefix === undefined || prefix.length < 3 || prefix.length > 10) {
            return {
                statusCode: 400,
                message: `Input validation error: prefix must be from 3 to 10 characters long. '${prefix}' does not fulfill the condition.`
            };
        }
        if (!this.validateName(projectName)) {
            return {
                statusCode: 400,
                message: `Input validation error: invalid project name '${projectName}'`
            };
        }
        if (!this.validatePrefix(prefix)) {
            return {
                statusCode: 400,
                message: `Input validation error: invalid prefix '${prefix}'`
            };
        }
        return this.createCmd.createProject(path, prefix, projectName);
    }

    /**
     * Creates a new template.
     * @param {string} templateName template name to create
     * @param {string} templateContent content for template
     * @param {string} path Optional, path to the project. If omitted, project is set from current path.
     * @returns {requestStatus}
     *       statusCode 200 when operation succeeded
     *  <br> statusCode 400 when input validation failed
     *  <br> statusCode 500 when there was a internal problem creating template
     */
    public async createTemplate(templateName: string, templateContent?: string, path?: string): Promise<requestStatus> {
        path = await this.setProjectPath(path);
        if (!this.validateFolder(path)) {
            return {
                statusCode: 400,
                message: `Input validation error: folder name is invalid '${path}'`
            };
        }
        if (!pathExists(path)) {
            return {
                statusCode: 400,
                message: `Input validation error: cannot find project '${path}'`
            };
        }
        if (!this.validateName(templateName) || !this.validateFolder(join(path, templateName))) {
            return {
                statusCode: 400,
                message: `Input validation error: template name is invalid '${templateName}'`
            };
        }
        const content = (templateContent) ? JSON.parse(templateContent) : Create.defaultTemplateContent();
        // Note that templateContent is validated in createTemplate()
        return this.createCmd.createTemplate(path, templateName, content);
    }

    /**
     * Creates a new workflow to a project.
     * @param {string} workflowName Workflow name.
     * @param {string} workflowContent Workflow content as JSON. Must conform to workflow-schema.json
     * @param {string} path Optional, path to the project. If omitted, project is set from current path.
     * @returns {requestStatus}
     *       statusCode 200 when operation succeeded
     *  <br> statusCode 400 when input validation failed
     *  <br> statusCode 500 when there was a internal problem creating workflow
     */
    public async createWorkflow(workflowName: string, workflowContent?: string, path?: string): Promise<requestStatus> {
        path = await this.setProjectPath(path);
        if (!this.validateFolder(path)) {
            return { statusCode: 400, message: `Input validation error: folder name is invalid '${path}'` };
        }
        if (!pathExists(path)) {
            return { statusCode: 400, message: `Input validation error: cannot find project '${path}'` };
        }
        if (!this.validateName(workflowName)) {
            return { statusCode: 400, message: `Input validation error: invalid workflow name '${workflowName}'` };
        }
        const content = (workflowContent) ? JSON.parse(workflowContent) : Create.defaultWorkflowContent(workflowName);
        content.name = workflowName;
        // Note that workflowContent is validated in the createWorkflow function.
        return this.createCmd.createWorkflow(path, content);
    }

    /**
     * Open a card (.json and .adoc) for editing
     *
     * @param cardKey Card key of a card
     * @param options Optional parameters. If options.path is omitted, project path is assumed to be current path (or it one of its parents).
     * @returns
     */
    public async edit(cardKey: string, options?: CardsOptions): Promise<requestStatus> {
        let path = options?.projectPath;
        path = await this.setProjectPath(path);

        if (!this.validateFolder(path)) {
            return {
                statusCode: 400,
                message: `Input validation error: folder name is invalid '${path}'`
            };
        }

        return this.editCmd.editCard(path, cardKey);
    }

    /**
     * Exports whole or partial card tree to a given format.
     * @param {string} destination where cards are exported in the defined format
     * @param {string} source from which directory card content is used
     * @param {string} parentCardKey parent card, if any. If undefined, whole project will be exported.
     * @param {string} mode export format (adoc, csv, html, pdf)
     * @returns {requestStatus}
     *       statusCode 200 when operation succeeded
     *  <br> statusCode 400 when input validation failed
     *  <br> statusCode 500 when there was a internal problem exporting
     */
    public async export(destination: string = 'output', source?: string, parentCardKey?: string, mode?: string): Promise<requestStatus> {
        source = await this.setProjectPath(source);
        if (!mode) {
            mode = 'html';
        }
        if (!this.validateFolder(source)) {
            return {
                statusCode: 400,
                message: `Input validation error: folder name is invalid '${source}'`
            };
        }
        if (!pathExists(source)) {
            return {
                statusCode: 400,
                message: `Input validation error: cannot find project '${source}'`
            };

        }
        if (parentCardKey && !await this.cardExists(source, parentCardKey)) {
            return {
                statusCode: 400,
                message: `Input validation error: cannot find card '${parentCardKey}'`
            };
        }
        if (mode && (mode !== 'html') && (mode !== 'pdf') && (mode !== 'adoc') && (mode !== 'site')) {
            return {
                statusCode: 400,
                message: `Input validation error: incorrect mode '${mode}'`
            };
        }
        if (mode === 'adoc') {
            return this.exportCmd.exportToADoc(source, destination, parentCardKey);
        } else if (mode === 'html') {
            return this.exportCmd.exportToHTML(source, destination, parentCardKey);
        } else if (mode === 'site') {
            return this.exportCmd.exportToSite(source, destination, parentCardKey);
        }
        return {
            statusCode: 400,
            message: `Unknown mode '${mode}'`
        };
    }

    /**
     * Imports another project to the 'path' project as a module.
     * @param {string} source Path to project to import
     * @param {string} name Module name for the imported project (what will the project be called as a module)
     * @param {string} path Optional. Destination project path. If omitted, destination project is set from current path.
     * @returns {requestStatus}
     *       statusCode 200 when operation succeeded
     *  <br> statusCode 400 when input validation failed
     */
    public async import(source: string, name: string, path?: string): Promise<requestStatus> {
        path = await this.setProjectPath(path);
        if (!this.validateFolder(path)) {
            return { statusCode: 400, message: `Input validation error: folder name is invalid '${path}'` };
        }
        if (!this.validateFolder(source)) {
            return { statusCode: 400, message: `Input validation error: folder name is invalid '${source}'` };
        }
        if (!pathExists(path)) {
            return { statusCode: 400, message: `Input validation error: cannot find project '${path}'` };
        }
        if (!pathExists(source)) {
            return { statusCode: 400, message: `Input validation error: cannot find project '${source}'` };
        }
        if (!this.validateName(name)) {
            return { statusCode: 400, message: `Input validation error: module name is invalid '${name}'` };
        }
        return this.importCmd.importProject(source, path, name);
    }

    /**
     * Moves a source card to be children of destination card. Or moves source card to be directly underneath cardroot.
     * @param {string} source cardKey of card that is moved
     * @param {string} destination cardKey of card where 'source' is moved to; or 'root' if moving 'source' to cardroot.
     * @param {string} path Optional. Path to the project. If omitted, project is set from current path.
     * @returns {requestStatus}
     *       statusCode 200 when operation succeeded
     *  <br> statusCode 400 when input validation fails.
     *  <br> statusCode 500 when files were not moved or deleted.
     */
    public async move(source: string, destination: string, path?: string): Promise<requestStatus> {
        // console.log(`Move request - source: ${source} destination: ${destination}`);
        path = await this.setProjectPath(path);
        if (!this.validateFolder(path)) {
            return { statusCode: 400, message: `Input validation error: folder name is invalid '${path}'` };
        }
        if (!pathExists(path)) {
            return { statusCode: 400, message: `Input validation error: cannot find project '${path}'` };
        }
        return this.moveCmd.moveCard(path, source, destination);
    }

    /**
     * Removes a card (single card, or parent card and children), or an attachment.
     * @param {string} type Type of resource to remove (attachment, card, template)
     * @param {string} targetName What will be removed. Either card-id or templateName
     * @param {string} detail Optional. Additional detail of removal, such as attachment name
     * @param {string} path Optional. Path to the project. If omitted, project is set from current path.
     * @returns {requestStatus}
     *       statusCode 200 when operation succeeded
     *  <br> statusCode 400 when target was not removed.
     */
    public async remove(type: string, targetName: string, detail?: string, path?: string): Promise<requestStatus> {
        //console.log(`Remove - type: ${type} path: ${path} targetName: ${targetName} detail: ${detail} templateName: ${templateName}`);
        if (!Commands.removableTypes.includes(type)) {
            return {
                statusCode: 400,
                message: `Input validation error: incorrect type '${type}'`
            };
        }
        path = await this.setProjectPath(path);
        if (!this.validateFolder(path)) {
            return {
                statusCode: 400,
                message: `Input validation error: folder name is invalid '${path}'`
            };
        }
        if (!pathExists(path)) {
            return {
                statusCode: 400,
                message: `Input validation error: cannot find project '${path}'`
            };
        }
        if (type === 'attachment' && detail === '') {
            return {
                statusCode: 400,
                message: `Input validation error: must define 'detail' when removing attachment from a card '${path}'`
            }
        }
        return this.removeCmd.remove(path, type, targetName, detail);
    }

    /**
     * Changes project prefix, and renames all project cards.
     * @param to New project prefix
     * @param {string} path Optional. Path to the project. If omitted, project is set from current path.
     *       statusCode 200 when operation succeeded
     *  <br> statusCode 400 when input validation failed
     */
    public async rename(to: string, path?: string): Promise<requestStatus> {
        path = await this.setProjectPath(path);
        if (!this.validateFolder(path)) {
            return {
                statusCode: 400,
                message: `Input validation error: folder name is invalid '${path}'`
            };
        }
        if (!pathExists(path)) {
            return {
                statusCode: 400,
                message: `Input validation error: cannot find project '${path}'`
            };
        }
        if (!to) {
            return {
                statusCode: 400,
                message: `Input validation error: empty 'to' is not allowed'`
            };

        }
        return this.renameCmd.rename(path, to);
    }

    /**
     * Shows wanted resources from a project / template.
     * @param {string} type type of resources to list
     * @param {string} typeDetail additional information about the resource (for example a cardkey for 'show card <cardkey>')
     * @param {CardsOptions} options Optional parameters. If options.path is omitted, project path is assumed to be current path (or it one of its parents).
     * @returns {requestStatus}
     *       statusCode 200 when operation succeeded
     *  <br> statusCode 400 when input validation failed
     *  <br> statusCode 500 when there was a internal problem showing resources
     */
    public async show(type: string, typeDetail?: string, options?: CardsOptions): Promise<requestStatus> {
        let path = options?.projectPath;

        path = await this.setProjectPath(path);

        if (!this.allAllowedTypes().includes(type)) {
            return { statusCode: 400, message: `Input validation error: illegal type '${type}'` };
        }
        if (!this.pluralizeTypes().includes(type) && !typeDetail && type !== 'project') {
            return { statusCode: 400, message: `Input validation error: must pass argument 'typeDetail' if requesting to show info on '${type}'` };
        }
        const detail = typeDetail || '';

        switch (type) {
            case 'attachments':
                return this.showCmd.showAttachments(path);
            case 'card': {
                const details = { contentType: 'adoc', content: options?.details, metadata: true, children: options?.details, parent: options?.details, attachments: true };
                return this.showCmd.showCardDetails(path, details, typeDetail);
            }
            case 'cards':
                return this.showCmd.showCards(path);
            case 'cardtype':
                return this.showCmd.showCardTypeDetails(path, detail);
            case 'cardtypes':
                return this.showCmd.showCardTypes(path);
            case 'fieldtype':
                return this.showCmd.showFieldType(path, detail);
            case 'fieldtypes':
                return this.showCmd.showFieldTypes(path);
            case 'module':
                return this.showCmd.showModule(path, detail);
            case 'modules':
                return this.showCmd.showModules(path);
            case 'project':
                return this.showCmd.showProject(path);
            case 'template':
                return this.showCmd.showTemplate(path, detail);
            case 'templates':
                return this.showCmd.showTemplates(path);
            case 'workflow':
                return this.showCmd.showWorkflow(path, detail);
            case 'workflows':
                return this.showCmd.showWorkflows(path);
            case 'attachment':// fallthrough - not implemented yet
            case 'link':    // fallthrough - not implemented yet
            case 'links':    // fallthrough - not implemented yet
            case 'projects': // fallthrough - not possible
            default:
                return {
                    statusCode: 400,
                    message: `Unknown or not yet handled type ${type}`,
                    payload: []
                };
        }
    }

    /**
     * Sets new state to a card.
     * @param {string} cardKey Cardkey of a card.
     * @param {string} stateName State to which the card should be set.
     * @param {string} path Optional, path to the project. If omitted, project is set from current path.
     * @returns {requestStatus}
     *       statusCode 200 when operation succeeded
     *  <br> statusCode 400 when input validation failed
     */
    public async transition(cardKey: string, stateName: string, path?: string): Promise<requestStatus> {
        path = await this.setProjectPath(path);
        return this.transitionCmd.cardTransition(path, cardKey, { name: stateName });
    }

    /**
     * Validates that a given path conforms to schema. Validates both file/folder structure and file content.
     * @param {string} path Optional, path to the project. If omitted, project is set from current path.
     * @returns {requestStatus}
     *       statusCode 200 when operation succeeded
     *  <br> statusCode 400 when input validation failed
     *  <br> statusCode 500 when there was a internal problem validating schema
     */
    public async validate(path?: string): Promise<requestStatus> {
        path = await this.setProjectPath(path);
        return this.validateCmd.validate(path);
    }

    /**
     * Starts the Cyberismo app by running npm start in the app project folder
     * @param {string} path Optional, path to the project. If omitted, project is set from current path.
     * @returns {requestStatus}
     *       statusCode 200 when operation succeeded
     *  <br> statusCode 400 when input validation failed
     *  <br> statusCode 500 when there was a internal problem validating schema
     */
    public async startApp(path?: string): Promise<requestStatus> {
        path = await this.setProjectPath(path);
        if (!this.validateFolder(path)) {
            return { statusCode: 400, message: `Input validation error: folder name is invalid '${path}'` };
        }
        if (!pathExists(path)) {
            return { statusCode: 400, message: `Input validation error: cannot find project '${path}'` };
        }

        console.log("Running Cyberismo app on http://localhost:3000/");
        console.log("Press Control+C to stop.");

        // __dirname when running cards ends with /tools/data-handler/dist - use that to navigate to app path
        const baseDir = dirname(fileURLToPath(import.meta.url));
        const appPath = resolve(baseDir, '../../app');

        // since current working directory changes, we need to resolve the project path
        const projectPath = resolve(path);



        execSync(`cd ${appPath} && npm start --project_path="${projectPath}"`);

        return { statusCode: 200 };
    }

}