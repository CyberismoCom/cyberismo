/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

// node
import { existsSync, readFileSync } from 'node:fs';
import mime from 'mime-types';

// cyberismo
import { attachmentPayload } from './interfaces/request-status-interfaces.js';
import {
  attachmentDetails,
  card,
  cardListContainer,
  cardtype,
  fetchCardDetails,
  fieldtype,
  linktype,
  moduleSettings,
  project,
  template,
  workflowMetadata,
} from './interfaces/project-interfaces.js';
import { Project } from './containers/project.js';

export class Show {
  static project: Project;

  constructor() {}

  /**
   * Shows all attachments (either template or project attachments) from a project.
   * @param {string} projectPath path to a project
   * @returns array of card attachments
   */
  public async showAttachments(
    projectPath: string,
  ): Promise<attachmentDetails[]> {
    Show.project = new Project(projectPath);
    const attachments: attachmentDetails[] = await Show.project.attachments();
    const templateAttachments: attachmentDetails[] = [];
    const templates = await Show.project.templates();
    for (const template of templates) {
      const templateObject = await Show.project.createTemplateObject(template);
      if (templateObject) {
        templateAttachments.push(...(await templateObject.attachments()));
      }
    }

    attachments.push(...templateAttachments);
    return attachments;
  }

  /**
   * Returns file buffer and mime type of an attachment. Used by app UI to download attachments.
   * @param {string} projectPath path to a project
   * @param {string} cardKey cardkey to find
   * @param {string} filename attachment filename
   * @returns attachment details
   */
  public async showAttachment(
    projectPath: string,
    cardKey: string,
    filename: string,
  ): Promise<attachmentPayload> {
    if (!cardKey) {
      throw new Error(`Mandatory parameter 'cardKey' missing`);
    }
    Show.project = new Project(projectPath);
    const details = {
      content: false,
      metadata: true,
      children: false,
      parent: false,
      attachments: true,
    };
    const card = await Show.project.cardDetailsById(cardKey, details);
    if (card === undefined) {
      throw new Error(`Card '${cardKey}' does not exist in the project`);
    }

    const attachment =
      card.attachments?.find((a) => a.fileName === filename) ?? undefined;
    let attachmentPath: string = '';
    if (attachment) {
      attachmentPath = `${attachment.path}/${attachment.fileName}`;
    }

    if (!attachment || !existsSync(attachmentPath)) {
      throw new Error(`Attachment '${filename}' not found for card ${cardKey}`);
    } else {
      const fileBuffer = readFileSync(attachmentPath);
      let mimeType = mime.lookup(attachmentPath);
      if (mimeType === false) {
        mimeType = 'application/octet-stream';
      }
      const payload: attachmentPayload = { fileBuffer, mimeType };
      return payload;
    }
  }

  /**
   * Shows details of a particular card (template card, or project card)
   * @note Note that parameter 'cardKey' is optional due to technical limitations of class calling this class. It must be defined to get valid results.
   * @param {string} projectPath path to a project
   * @param {string} details card details to show
   * @param {string} cardKey cardkey to find
   * @returns card details object
   */
  public async showCardDetails(
    projectPath: string,
    details: fetchCardDetails,
    cardKey?: string,
  ): Promise<card> {
    if (!cardKey) {
      throw new Error(`Mandatory parameter 'cardKey' missing`);
    }
    Show.project = new Project(projectPath);
    const cardDetails = await Show.project.cardDetailsById(cardKey, details);
    if (cardDetails === undefined) {
      throw new Error(`Card '${cardKey}' does not exist in the project`);
    }
    return cardDetails;
  }

  /**
   * Shows all cards (either template or project cards) from a project.
   * @param {string} projectPath path to a project
   * @returns cards list array
   */
  public async showCards(projectPath: string): Promise<cardListContainer[]> {
    Show.project = new Project(projectPath);
    const projectCards = await Show.project.listAllCards(true);
    return projectCards;
  }

  /**
   * Returns all project cards in the project. Cards don't have content and nor metadata.
   * @param projectPath path to a project
   * @note AppUi uses this method.
   * @returns array of cards
   */
  public async showProjectCards(projectPath: string): Promise<card[]> {
    Show.project = new Project(projectPath);
    const projectCards = await Show.project.showProjectCards();
    return projectCards;
  }

  /**
   * Shows details of a particular cardtype.
   * @param {string} projectPath path to a project
   * @param {string} cardtypeName cardtype name
   * @returns cardtype details
   */
  public async showCardTypeDetails(
    projectPath: string,
    cardtypeName: string,
  ): Promise<cardtype> {
    Show.project = new Project(projectPath);
    if (cardtypeName === '') {
      throw new Error(`Must define cardtype name to query its details.`);
    }
    const cardtypeDetails = await Show.project.cardType(cardtypeName);
    if (cardtypeDetails === undefined) {
      throw new Error(`Cardtype '${cardtypeName}' not found from the project.`);
    }
    return cardtypeDetails;
  }

  /**
   * Shows all cardtypes in a project.
   * @param {string} projectPath path to a project
   * @returns array of cardtype names
   */
  public async showCardTypes(projectPath: string): Promise<string[]> {
    Show.project = new Project(projectPath);
    const cardtypes = (await Show.project.cardtypes())
      .map((item) => item.name)
      .sort();
    return cardtypes;
  }

  /**
   * Shows all cardtypes in a project.
   * @todo: missing tests
   * @param {string} projectPath path to a project
   * @returns array of cardtype details
   */
  public async showCardTypesWithDetails(
    projectPath: string,
  ): Promise<(cardtype | undefined)[]> {
    Show.project = new Project(projectPath);
    const promiseContainer = [];
    for (const cardtype of await Show.project.cardtypes()) {
      const cardtypeDetails = Show.project.cardType(cardtype.name);
      if (cardtypeDetails) {
        promiseContainer.push(cardtypeDetails);
      }
    }
    const results = await Promise.all(promiseContainer);
    return results.filter((item) => item);
  }

  /**
   * Shows all available link types.
   * @param {string} projectPath path to a project
   * @returns all available link types
   */
  public async showLinkTypes(projectPath: string): Promise<string[]> {
    Show.project = new Project(projectPath);
    const linktypes = (await Show.project.linkTypes())
      .map((item) => item.name.split('.').slice(0, -1).join('.'))
      .sort();
    return linktypes;
  }

  /**
   * Shows details of a link type.
   * @param {string} projectPath path to a project
   * @param {string} linkTypeName name of a link type
   * @returns details of a link type.
   */
  public async showLinkType(
    projectPath: string,
    linkTypeName: string,
  ): Promise<linktype | undefined> {
    Show.project = new Project(projectPath);
    const linkTypeDetails = await Show.project.linkType(linkTypeName);
    return linkTypeDetails;
  }

  /**
   * Shows all available field-types.
   * @param {string} projectPath path to a project
   * @returns all available field-types
   */
  public async showFieldTypes(projectPath: string): Promise<string[]> {
    Show.project = new Project(projectPath);
    const cardtypes = (await Show.project.fieldtypes())
      .map((item) => item.name.split('.').slice(0, -1).join('.'))
      .sort();
    return cardtypes;
  }

  /**
   * Shows details of a field type.
   * @param {string} projectPath path to a project
   * @param {string} fieldTypeName name of a field type
   * @returns details of a field type.
   */
  public async showFieldType(
    projectPath: string,
    fieldTypeName: string,
  ): Promise<fieldtype | undefined> {
    Show.project = new Project(projectPath);
    const filedTypeDetails = await Show.project.fieldType(fieldTypeName);
    return filedTypeDetails;
  }

  /**
   * Shows details of a module.
   * @param {string} projectPath path to a project
   * @param {string} moduleName name of a module
   * @returns details of a module.
   */
  public async showModule(
    projectPath: string,
    moduleName: string,
  ): Promise<moduleSettings> {
    Show.project = new Project(projectPath);
    const moduleDetails = await Show.project.module(moduleName);
    if (!moduleDetails) {
      throw new Error(`Module '${moduleName}' does not exist in the project`);
    }
    return moduleDetails;
  }

  /**
   * Shows all modules (if any) in a project.
   * @param {string} projectPath path to a project
   * @returns all modules in a project.
   */
  public async showModules(projectPath: string): Promise<string[]> {
    Show.project = new Project(projectPath);
    const modules = (await Show.project.modules())
      .map((item) => item.name)
      .sort();
    return modules;
  }

  /**
   * Shows all modules with full details in a project.
   * @param {string} projectPath path to a project
   * @todo: add unit tests
   * @returns all modules in a project.
   */
  public async showModulesWithDetails(
    projectPath: string,
  ): Promise<(moduleSettings | undefined)[]> {
    Show.project = new Project(projectPath);
    const promiseContainer = [];
    for (const module of await Show.project.modules()) {
      promiseContainer.push(Show.project.module(module.name));
    }
    const results = await Promise.all(promiseContainer);
    return results.filter((item) => item);
  }

  /**
   * Shows details of a particular project.
   * @param {string} projectPath path to a project
   * @returns project information
   */
  public async showProject(projectPath: string): Promise<project> {
    Show.project = new Project(projectPath);
    return await Show.project.show();
  }

  /**
   * Shows details of a particular template.
   * @param {string} projectPath path to a project
   * @param {string} templateName template name
   * @returns template details
   */
  public async showTemplate(
    projectPath: string,
    templateName: string,
  ): Promise<object> {
    Show.project = new Project(projectPath);
    const templateObject =
      await Show.project.createTemplateObjectByName(templateName);
    if (!templateObject) {
      throw new Error(
        `Template '${templateName}' does not exist in the project`,
      );
    }
    // Remove 'project' from template data.
    const { project: _, ...template } = await templateObject.show(); // eslint-disable-line @typescript-eslint/no-unused-vars

    // todo: Define interface for template
    return template;
  }

  /**
   * Shows all templates in a project.
   * @param {string} projectPath path to a project
   * @returns templates array
   */
  public async showTemplates(projectPath: string): Promise<string[]> {
    Show.project = new Project(projectPath);
    const templates = (await Show.project.templates())
      .map((item) => item.name)
      .sort();
    return templates;
  }

  /**
   * Shows all templates with full details in a project.
   * @param {string} projectPath path to a project
   * @todo: add unit tests
   * @returns all templates in a project.
   */
  public async showTemplatesWithDetails(
    projectPath: string,
  ): Promise<template[]> {
    Show.project = new Project(projectPath);
    const promiseContainer = (await Show.project.templates()).map((template) =>
      Show.project
        .createTemplateObjectByName(template.name)
        .then((t) => t?.show()),
    );
    const result = await Promise.all(promiseContainer);
    return result.filter(Boolean) as template[];
  }

  /**
   * Shows details of a particular workflow.
   * @param {string} projectPath path to a project
   * @param {string} workflowName name of workflow
   * @returns workflow details
   */
  public async showWorkflow(
    projectPath: string,
    workflowName: string,
  ): Promise<workflowMetadata> {
    Show.project = new Project(projectPath);
    if (workflowName === '') {
      throw new Error(`Must define workflow name to query its details.`);
    }
    const workflowContent = await Show.project.workflow(workflowName);
    if (workflowContent === undefined) {
      throw new Error(`Workflow '${workflowName}' not found from the project.`);
    }
    return workflowContent;
  }

  /**
   * Shows all workflows in a project.
   * @param {string} projectPath path to a project
   * @returns workflows
   */
  public async showWorkflows(projectPath: string): Promise<string[]> {
    Show.project = new Project(projectPath);
    const workflows = (await Show.project.workflows())
      .map((item) => item.name)
      .sort();
    return workflows;
  }

  /**
   * Shows all workflows with full details in a project.
   * @todo: missing tests
   * @param {string} projectPath path to a project
   * @returns workflows with full details
   */
  public async showWorkflowsWithDetails(
    projectPath: string,
  ): Promise<(workflowMetadata | undefined)[]> {
    const promiseContainer = [];
    Show.project = new Project(projectPath);
    for (const workflow of await Show.project.workflows()) {
      promiseContainer.push(Show.project.workflow(workflow.name));
    }
    const results = await Promise.all(promiseContainer);
    return results.filter((item) => item);
  }
}
