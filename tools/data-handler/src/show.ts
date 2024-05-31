// node
import { existsSync, readFileSync } from 'node:fs';
import mime from 'mime-types';

// ismo
import { attachmentPayload, requestStatus } from './interfaces/request-status-interfaces.js';
import { errorFunction } from './utils/log-utils.js';
import { fetchCardDetails } from './interfaces/project-interfaces.js';
import { Project } from './containers/project.js';

export class Show {

    static project: Project;

    constructor() { }

    /**
     * Shows all attachments (either template or project attachments) from a project.
     * @param {string} projectPath path to a project
     * @returns request status; payload contains card attachments
     *       statusCode 200 when operation succeeded
     *  <br> statusCode 400 when template was not found the project
     * 'payload' contains all the attachments in an array of objects ({ card: <card-id>, attachment: <attachment-name> })
     */
    public async showAttachments(projectPath: string): Promise<requestStatus> {
        Show.project = new Project(projectPath);
        const attachments: object[] = await Show.project.attachments();
        const templateAttachments: object[] = [];
        const templates = await Show.project.templates();
        for (const template of templates) {
            const templateObject = await Show.project.createTemplateObject(template);
            if (templateObject) {
                templateAttachments.push(...await templateObject.attachments());
            }
        }

        attachments.push(...templateAttachments);
        return { statusCode: 200, payload: attachments };
    }

    /**
     * Returns file buffer and mime type of an attachment. Used by app UI to download attachments.
     * @param {string} projectPath path to a project
     * @param {string} cardKey cardkey to find
     * @param {string} filename attachment filename
     * @returns object with request status, successful request contains payload with attachment file buffer and mime type
     *       statusCode 200 when operation succeeded
     *  <br> statusCode 400 when input validation failed or card or attachment not found
     */
    public async showAttachment(projectPath: string, cardKey: string, filename: string): Promise<requestStatus> {
        if (!cardKey) {
            return { statusCode: 400, message: `Mandatory parameter 'cardKey' missing` };
        }
        Show.project = new Project(projectPath);
        const details = { content: false, metadata: true, children: false, parent: false, attachments: true };
        const card = await Show.project.cardDetailsById(cardKey, details);
        if (card === undefined) {
            return { statusCode: 400, message: `Card '${cardKey}' does not exist in the project` };
        }

        const attachment = card.attachments?.find(a => a.fileName === filename) ?? undefined;
        let attachmentPath: string = '';
        if (attachment) {
            attachmentPath = `${attachment.path}/${attachment.fileName}`;
        }

        if (!attachment || !existsSync(attachmentPath)) {
            return { statusCode: 400, message: `Attachment '${filename}' not found for card ${cardKey}` };
        } else {
            const fileBuffer = readFileSync(attachmentPath);
            let mimeType = mime.lookup(attachmentPath);
            if (mimeType === false) {
                mimeType = 'application/octet-stream';
            }
            const payload: attachmentPayload = { fileBuffer, mimeType };

            return {
                statusCode: 200,
                payload: payload
            };
        }
    }

    /**
     * Shows details of a particular card (template card, or project card)
     * @note Note that parameter 'cardKey' is optional due to technical limitations of class calling this class. It must be defined to get valid results.
     * @param {string} projectPath path to a project
     * @param {string} details card details to show
     * @param {string} cardKey cardkey to find
     * @returns request status; payload contains card details
     *       statusCode 200 when operation succeeded
     *  <br> statusCode 400 when input validation failed
     */
    public async showCardDetails(projectPath: string, details: fetchCardDetails, cardKey?: string): Promise<requestStatus> {
        if (!cardKey) {
            return { statusCode: 400, message: `Mandatory parameter 'cardKey' missing` };
        }
        Show.project = new Project(projectPath);
        const cardDetails = await Show.project.cardDetailsById(cardKey, details);
        if (cardDetails === undefined) {
            return { statusCode: 400, message: `Card '${cardKey}' does not exist in the project` };
        }
        return { statusCode: 200, payload: cardDetails };
    }

    /**
     * Shows all cards (either template or project cards) from a project.
     * @param {string} projectPath path to a project
     * @returns request status; payload contains cards
     *       statusCode 200 when operation succeeded
     * <br>  statusCode 400 when template was not found the project
     */
    public async showCards(projectPath: string): Promise<requestStatus> {
        Show.project = new Project(projectPath);
        const projectCards = await Show.project.listAllCards(true);
        return { statusCode: 200, payload: projectCards };
    }

    /**
     * Returns all project cards in the project. Cards don't have content and nor metadata.
     * @param projectPath path to a project
     * @note AppUi uses this method.
     *       statusCode 200 when operation succeeded, project cards are in the payload
     *  <br> statusCode 500 when unknown error happened.
     */
    public async showProjectCards(projectPath: string): Promise<requestStatus> {
        try {
            Show.project = new Project(projectPath);
            const projectCards = await Show.project.showProjectCards();
            return { statusCode: 200, payload: projectCards };
        } catch (error) {
            return { statusCode: 500, message: errorFunction(error) };
        }
    }

    /**
     * Shows details of a particular cardtype.
     * @param {string} projectPath path to a project
     * @param {string} cardtypeName cardtype name
     * @returns request status; payload contains cardtype details
     *       statusCode 200 when operation succeeded
     *  <br> statusCode 400 when input validation failed
     */
    public async showCardTypeDetails(projectPath: string, cardtypeName: string): Promise<requestStatus> {
        Show.project = new Project(projectPath);
        if (cardtypeName === '') {
            return { statusCode: 400, message: `Must define cardtype name to query its details.` };
        }
        const cardtypeDetails = await Show.project.cardType(cardtypeName);
        if (cardtypeDetails === undefined) {
            return { statusCode: 400, message: `Cardtype '${cardtypeName}' not found from the project.` };
        }
        return { statusCode: 200, payload: cardtypeDetails };
    }

    /**
     * Shows all cardtypes in a project.
     * @param {string} projectPath path to a project
     * @returns request status; payload contains cardtypes
     *       statusCode 200 when operation succeeded
     */
    public async showCardTypes(projectPath: string): Promise<requestStatus> {
        Show.project = new Project(projectPath);
        const cardtypes = (await Show.project.cardtypes())
            .map(item => item.name)
            .sort();
        return { statusCode: 200, payload: cardtypes };
    }

    /**
     * Shows all cardtypes in a project.
     * @todo: missing tests
     * @param {string} projectPath path to a project
     * @returns request status; payload contains cardtypes
     *       statusCode 200 when operation succeeded
    */
    public async showCardTypesWithDetails(projectPath: string): Promise<requestStatus> {
        Show.project = new Project(projectPath);
        const promiseContainer = [];
        for (const cardtype of await Show.project.cardtypes()) {
            promiseContainer.push(await Show.project.cardType(cardtype.name));
        }
        return { statusCode: 200, payload: await Promise.all(promiseContainer) };
    }

    /**
     * Shows all available field-types.
     * @param {string} projectPath path to a project
     * @returns all available field-types
     */
    public async showFieldTypes(projectPath: string): Promise<requestStatus> {
        Show.project = new Project(projectPath);
        const cardtypes = (await Show.project.fieldtypes())
            .map(item => item.name.split(".").slice(0, -1).join("."))
            .sort();
        return { statusCode: 200, payload: cardtypes };
    }

    /**
     * Shows details of a field type.
     * @param {string} projectPath path to a project
     * @param {string} fieldTypeName name of a field type
     * @returns details of a field type.
     */
    public async showFieldType(projectPath: string, fieldTypeName: string): Promise<requestStatus> {
        Show.project = new Project(projectPath);
        const filedTypeDetails = await Show.project.fieldType(fieldTypeName);
        return { statusCode: 200, payload: filedTypeDetails };
    }

    /**
     * Shows details of a module.
     * @param {string} projectPath path to a project
     * @param {string} moduleName name of a module
     * @returns details of a module.
     */
    public async showModule(projectPath: string, moduleName: string): Promise<requestStatus> {
        Show.project = new Project(projectPath);
        const moduleDetails = await Show.project.module(moduleName);
        if (!moduleDetails) {
            return { statusCode: 400, message: `Module '${moduleName}' does not exist in the project` };
        }
        return { statusCode: 200, payload: moduleDetails };
    }

    /**
     * Shows all modules (if any) in a project.
     * @param {string} projectPath path to a project
     * @returns all modules in a project.
     */
    public async showModules(projectPath: string): Promise<requestStatus> {
        Show.project = new Project(projectPath);
        const modules = (await Show.project.modules())
            .map(item => item.name)
            .sort();
        return { statusCode: 200, payload: modules };
    }

    /**
     * Shows all modules with full details in a project.
     * @param {string} projectPath path to a project
     * @todo: add unit tests
     * @returns all modules in a project.
     */
    public async showModulesWithDetails(projectPath: string): Promise<requestStatus> {
        Show.project = new Project(projectPath);
        const promiseContainer = [];
        for (const module of await Show.project.modules()) {
            promiseContainer.push(Show.project.module((module.name)));
        }
        return { statusCode: 200, payload: await Promise.all(promiseContainer) };
    }

    /**
     * Shows details of a particular project.
     * @param {string} projectPath path to a project
     * @returns request status; payload contains project information
     *       statusCode 200 when operation succeeded
     */
    public async showProject(projectPath: string): Promise<requestStatus> {
        Show.project = new Project(projectPath);
        return { statusCode: 200, payload: await Show.project.show() };
    }

    /**
     * Shows details of a particular template.
     * @param {string} projectPath path to a project
     * @param {string} templateName template name
     * @returns request status; payload contains template details
     *       statusCode 200 when operation succeeded
     *  <br> statusCode 400 when input validation failed
     */
    public async showTemplate(projectPath: string, templateName: string): Promise<requestStatus> {
        Show.project = new Project(projectPath);
        const templateObject = await Show.project.createTemplateObjectByName(templateName);
        if (!templateObject) {
            return { statusCode: 400, message: `Template '${templateName}' does not exist in the project` };
        }
        // Remove 'project' from template data.
        const { project: _, ...template } = await templateObject.show(); // eslint-disable-line @typescript-eslint/no-unused-vars

        return { statusCode: 200, payload: template };
    }

    /**
     * Shows all templates in a project.
     * @param {string} projectPath path to a project
     * @returns request status; payload contains templates
     *       statusCode 200 when operation succeeded
     */
    public async showTemplates(projectPath: string): Promise<requestStatus> {
        Show.project = new Project(projectPath);
        const templates = (await Show.project.templates())
            .map(item => item.name)
            .sort();
        return { statusCode: 200, payload: templates };
    }

    /**
     * Shows all templates with full details in a project.
     * @param {string} projectPath path to a project
     * @todo: add unit tests
     * @returns all templates in a project.
     */
    public async showTemplatesWithDetails(projectPath: string): Promise<requestStatus> {
        Show.project = new Project(projectPath);
        const promiseContainer = [];
        for (const template of await Show.project.templates()) {
            // todo: template() method just returns what templates() already lists.
            promiseContainer.push(Show.project.template(template.name));
        }
        return { statusCode: 200, payload: await Promise.all(promiseContainer) };
    }

    /**
     * Shows details of a particular workflow.
     * @param {string} projectPath path to a project
     * @param {string} workflowName name of workflow
     * @returns request status; payload contains workflow details
     *       statusCode 200 when operation succeeded
     *  <br> statusCode 400 when input validation failed
     */
    public async showWorkflow(projectPath: string, workflowName: string): Promise<requestStatus> {
        Show.project = new Project(projectPath);
        if (workflowName === '') {
            return { statusCode: 400, message: `Must define workflow name to query its details.` };
        }
        const workflowContent = await Show.project.workflow(workflowName);
        if (workflowContent === undefined) {
            return { statusCode: 400, message: `Workflow '${workflowName}' not found from the project.` };
        }
        return { statusCode: 200, payload: workflowContent };
    }

    /**
     * Shows all workflows in a project.
     * @param {string} projectPath path to a project
     * @returns request status; payload contains workflows
     *       statusCode 200 when operation succeeded
     */
    public async showWorkflows(projectPath: string): Promise<requestStatus> {
        Show.project = new Project(projectPath);
        const workflows = (await Show.project.workflows())
            .map(item => item.name)
            .sort();
        return { statusCode: 200, payload: workflows };
    }

    /**
     * Shows all workflows with full details in a project.
     * @todo: missing tests
     * @param {string} projectPath path to a project
     * @returns request status; payload contains workflows with full details
     *       statusCode 200 when operation succeeded
     */
    public async showWorkflowsWithDetails(projectPath: string): Promise<requestStatus> {
        const promiseContainer = [];
        Show.project = new Project(projectPath);
        for (const workflow of await Show.project.workflows()) {
            promiseContainer.push(Show.project.workflow(workflow.name));
        }
        return { statusCode: 200, payload: await Promise.all(promiseContainer) };
    }
}