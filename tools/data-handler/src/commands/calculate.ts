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
import { basename, join, resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { sanitizeSvgBase64 } from '../utils/sanitize-svg.js';
import { graphviz } from 'node-graphviz';

import type {
  BaseResult,
  ParseResult,
  QueryName,
  QueryResult,
} from '../types/queries.js';
import type { Card } from '../interfaces/project-interfaces.js';
import ClingoParser from '../utils/clingo-parser.js';
import { pathExists } from '../utils/file-utils.js';
import { Mutex } from 'async-mutex';
import Handlebars from 'handlebars';
import { type Project, ResourcesFrom } from '../containers/project.js';
import { flattenCardArray } from '../utils/card-utils.js';
import { logger } from '../utils/log-utils.js';
import {
  createCardFacts,
  createCardTypeFacts,
  createFieldTypeFacts,
  createLinkTypeFacts,
  createModuleFacts,
  createProjectFacts,
  createReportFacts,
  createTemplateFacts,
  createWorkflowFacts,
} from '../utils/clingo-facts.js';
import { CardMetadataUpdater } from '../card-metadata-updater.js';
import type {
  CardType,
  FieldType,
  LinkType,
  ReportMetadata,
  TemplateMetadata,
  Workflow,
} from '../interfaces/resource-interfaces.js';
import { solve, setBaseProgram } from '@cyberismocom/node-clingo';
import { generateReportContent } from '../utils/report.js';
import { lpFiles, graphvizReport } from '@cyberismocom/resources';

// Define names for the base programs
const BASE_PROGRAM_KEY = 'base';
const QUERY_LANGUAGE_KEY = 'queryLanguage';

// Class that calculates with logic program card / project level calculations.
export class Calculate {
  private static mutex = new Mutex();

  constructor(private project: Project) {}

  // Storage for in-memory program content
  private logicProgram: string = '';
  private modules: string = '';

  private modulesInitialized = false;

  // Initialize modules during construction
  private async initializeModules() {
    try {
      // Collect all available calculations at initialization time
      const modules = await this.generateModules();
      this.modules = modules; // Store initial modules in logicProgram
    } catch (error) {
      logger.error(`Failed to initialize modules: ${error}`);
    }
  }

  // Wrapper to run onCreation query.
  private async creationQuery(cardKeys: string[]) {
    if (!cardKeys) return undefined;
    return this.runQuery('onCreation', {
      cardKeys,
    });
  }

  // Generate card tree content
  private async generateCardTreeContent(parentCard: Card | undefined) {
    const cards = await this.getCards(parentCard);

    let content = '% SECTION: CARDS_START\n';

    for (const card of cards) {
      const cardContent = await createCardFacts(card, this.project);
      content += `% SECTION: CARD_${card.key}_START\n`;
      content += `% Card ${card.key}\n`;
      content += `${cardContent}\n`;
      content += `% SECTION: CARD_${card.key}_END\n\n`;
    }

    content += '% SECTION: CARDS_END';

    return content;
  }

  //
  private async generateCardTypes() {
    const cardTypes = await this.project.cardTypes();
    let content = '';

    for (const cardType of await Promise.all(
      cardTypes.map((c) => this.project.resource<CardType>(c.name)),
    )) {
      if (!cardType) continue;

      const cardTypeContent = createCardTypeFacts(cardType);
      content += `% CardType ${cardType.name}\n${cardTypeContent}\n\n`;
    }

    return content;
  }

  //
  private async generateFieldTypes() {
    const fieldTypes = await this.project.fieldTypes();
    let content = '';

    for (const fieldType of await Promise.all(
      fieldTypes.map((m) => this.project.resource<FieldType>(m.name)),
    )) {
      if (!fieldType) continue;

      const fieldTypeContent = createFieldTypeFacts(fieldType);
      content += `% FieldType ${fieldType.name}\n${fieldTypeContent}\n\n`;
    }
    return content;
  }

  // Collects all linkTypes from the project
  private async generateLinkTypes() {
    const linkTypes = await this.project.linkTypes();
    let content = '';

    for (const linkType of await Promise.all(
      linkTypes.map((c) => this.project.resource<LinkType>(c.name)),
    )) {
      if (!linkType) continue;

      const linkTypeContent = createLinkTypeFacts(linkType);
      content += `% LinkType ${linkType.name}\n${linkTypeContent}\n\n`;
    }

    return content;
  }

  // Generates logic programs related to modules (and project itself).
  private async generateModules() {
    const modules = await this.project.modules();
    let content = '';
    for (const module of await Promise.all(
      modules.map((mod) => this.project.module(mod.name)),
    )) {
      if (!module) continue;
      const moduleContent = createModuleFacts(module);
      content = content.concat(moduleContent);
    }
    const projectContent = createProjectFacts(this.project.projectPrefix);
    content = content.concat(projectContent);
    return content;
  }

  // Collects all logic calculation files from project (local and imported modules)
  private async generateCalculations() {
    // Collect all available calculations
    const calculations = await this.project.calculations(ResourcesFrom.all);
    let content = '% SECTION: MODULES_START\n';

    // Process modules content
    for (const calculationFile of calculations) {
      if (calculationFile.path) {
        const moduleLogicFile = resolve(
          join(calculationFile.path, basename(calculationFile.name)),
        );

        const filePath = moduleLogicFile.endsWith('.lp')
          ? moduleLogicFile
          : moduleLogicFile + '.lp';

        if (pathExists(filePath)) {
          try {
            const moduleContent = await readFile(filePath, 'utf-8');
            content += `% SECTION: MODULE_${calculationFile.name}_START\n`;
            content += `% Module ${calculationFile.name}\n`;
            content += `${moduleContent}\n`;
            content += `% SECTION: MODULE_${calculationFile.name}_END\n\n`;
          } catch (error) {
            logger.warn(
              `Failed to read module ${calculationFile.name}: ${error}`,
            );
          }
        }
      }
    }
    content += '% SECTION: MODULES_END';
    return content;
  }

  // Generates logic programs related to reports.
  private async generateReports() {
    const reports = await this.project.reports();
    let content = '';

    for (const report of await Promise.all(
      reports.map((r) => this.project.resource<ReportMetadata>(r.name)),
    )) {
      if (!report) continue;
      content += createReportFacts(report);
    }
    return content;
  }

  // Generates logic programs related to templates (including their cards).
  private async generateTemplates() {
    const templates = await this.project.templates();
    let content = '';

    for (const template of await Promise.all(
      templates.map((r) => this.project.resource<TemplateMetadata>(r.name)),
    )) {
      if (!template) continue;

      let templateContent = createTemplateFacts(template);
      const cards = await this.getCards(undefined, template.name);
      for (const card of cards) {
        const cardContent = await createCardFacts(card, this.project);
        templateContent = templateContent.concat(cardContent);
      }
      content = content.concat(templateContent);
    }
    return content;
  }

  //
  private async generateWorkFlows() {
    const workflows = await this.project.workflows();
    let content = '';

    // loop through workflows
    for (const workflow of await Promise.all(
      workflows.map((m) => this.project.resource<Workflow>(m.name)),
    )) {
      if (!workflow) continue;

      const workflowContent = createWorkflowFacts(workflow);
      content += `% Workflow ${workflow.name}\n${workflowContent}\n\n`;
    }

    return content;
  }

  // Gets either all the cards (no parent), or a subtree.
  private async getCards(
    card: Card | undefined,
    templateName?: string,
  ): Promise<Card[]> {
    let cards: Card[] = [];
    if (!card) {
      return templateName
        ? this.project.templateCards(templateName)
        : this.project.cards();
    }
    if (card.children) {
      cards = flattenCardArray(card.children);
    }
    card.children = [];
    cards.unshift(card);
    return cards;
  }

  // Checks that Clingo successfully returned result.
  private async parseClingoResult(
    data: string[],
  ): Promise<ParseResult<BaseResult>> {
    const parser = new ClingoParser();
    return parser.parseInput(data.join('\n'));
  }

  private async run(query: string): Promise<string[]> {
    const res = await Calculate.mutex.runExclusive(async () => {
      // For queries, use both base and queryLanguage
      const basePrograms = [BASE_PROGRAM_KEY, QUERY_LANGUAGE_KEY];

      // Then solve with the program - need to pass the program as parameter
      return solve(query, basePrograms);
    });

    logger.trace(
      {
        query,
      },
      `Ran Clingo solve command`,
    );

    if (res && res.answers && res.answers.length > 0) {
      logger.trace({
        result: res.answers,
      });
      return res.answers;
    }

    throw new Error('Failed to run Clingo solve. No answers returned.');
  }

  /**
   * Generates a logic program.
   * @param cardKey Optional, sub-card tree defining card
   */
  public async generate(cardKey?: string) {
    await Calculate.mutex.runExclusive(async () => {
      if (!this.modulesInitialized) {
        await this.initializeModules();
        this.modulesInitialized = true;
      }

      let card: Card | undefined;
      if (cardKey) {
        card = await this.project.findSpecificCard(cardKey, {
          metadata: true,
          children: true,
          content: false,
          parent: false,
        });
        if (!card) {
          throw new Error(`Card '${cardKey}' not found`);
        }
      }
      const calculations = await this.generateCalculations();
      const cardTreeContent = await this.generateCardTreeContent(card);
      const workFlows = await this.generateWorkFlows();
      const cardTypes = await this.generateCardTypes();
      const fieldTypes = await this.generateFieldTypes();
      const linkTypes = await this.generateLinkTypes();
      const reports = await this.generateReports();
      const templates = await this.generateTemplates();

      // Combine all resources
      const resourcesProgram =
        '% SECTION: RESOURCES_START\n' +
        calculations +
        workFlows +
        cardTypes +
        fieldTypes +
        linkTypes +
        reports +
        templates +
        '% SECTION: RESOURCES_END';

      // Create base program content
      const baseProgram =
        '% SECTION: BASE_START\n' +
        lpFiles.common.base +
        '\n% SECTION: BASE_END\n\n' +
        this.modules +
        '\n\n' +
        cardTreeContent +
        '\n\n' +
        resourcesProgram;

      // Set the base programs separately
      setBaseProgram(baseProgram, BASE_PROGRAM_KEY);
      setBaseProgram(
        '% SECTION: QUERY_LANGUAGE_START\n' +
          lpFiles.common.queryLanguage +
          '\n% SECTION: QUERY_LANGUAGE_END',
        QUERY_LANGUAGE_KEY,
      );

      // Also store the base program (without query language) for updates
      this.logicProgram = baseProgram;
    });
  }

  /**
   * When card changes, update the card specific calculations.
   * @param changedCard Card that was changed.
   */
  public async handleCardChanged(changedCard: Card) {
    await this.generate(changedCard.key);
    return { statusCode: 200 };
  }

  /**
   * When cards are removed, automatically remove card-specific calculations.
   * @param deletedCard Card that is to be removed.
   */
  public async handleDeleteCard(deletedCard: Card) {
    if (!deletedCard) {
      return;
    }

    await Calculate.mutex.runExclusive(async () => {
      const affectedCards = await this.getCards(deletedCard);

      // Filter out deleted cards' content from the cardsProgram string
      for (const card of affectedCards) {
        // Remove card-specific content from the in-memory program using section markers
        const cardSectionPattern = new RegExp(
          `% SECTION: CARD_${card.key}_START[\\s\\S]*?% SECTION: CARD_${card.key}_END\\n\\n`,
          'g',
        );
        this.logicProgram = this.logicProgram.replace(cardSectionPattern, '');
      }

      // Update the base program after modifying logicProgram
      setBaseProgram(this.logicProgram, BASE_PROGRAM_KEY);
    });
  }

  /**
   * When new cards are added, automatically calculate card-specific values.
   * @param cards Added cards.
   */
  public async handleNewCards(cards: Card[]) {
    if (!cards) {
      return;
    }

    // Only proceed if we already have a logic program
    if (!this.logicProgram) {
      return;
    }

    await Calculate.mutex.runExclusive(async () => {
      // Generate content for all cards (including new ones)
      const cardTreeContent = await this.generateCardTreeContent(undefined);

      // Update the main logic program with the new cards program
      if (
        this.logicProgram.includes('% SECTION: CARDS_START') &&
        this.logicProgram.includes('% SECTION: CARDS_END')
      ) {
        this.logicProgram = this.logicProgram.replace(
          /% SECTION: CARDS_START[\s\S]*?% SECTION: CARDS_END/,
          cardTreeContent,
        );
      }

      // Update the base program after modifying logicProgram
      setBaseProgram(this.logicProgram, BASE_PROGRAM_KEY);
    });

    const cardKeys = cards.map((item) => item.key);
    const queryResult = await this.creationQuery(cardKeys);
    if (
      !queryResult ||
      queryResult.at(0) === undefined ||
      queryResult.at(0)?.updateFields === undefined
    ) {
      return;
    }

    const fieldsToUpdate = queryResult.at(0)!.updateFields;
    await CardMetadataUpdater.apply(this.project, fieldsToUpdate);
  }

  /**
   * Runs given logic program and creates a graph using clingraph
   * @param data Provide a query or/and a file which can be given to clingraph
   * @param timeout Maximum amount of milliseconds clingraph is allowed to run
   * @returns a base64 encoded image as a string
   */
  public async runGraph(model: string, view: string) {
    // Let's run the clingraph query
    const result = await generateReportContent({
      calculate: this,
      contentTemplate: graphvizReport.content,
      queryTemplate: graphvizReport.query,
      options: {
        model: model,
        view: view,
      },
      graph: true,
    });
    return sanitizeSvgBase64(await graphviz.dot(result, 'svg'));
  }

  /**
   * Runs a logic program using clingo.
   * @param query Logic program to be run
   * @returns parsed program output
   */
  public async runLogicProgram(query: string) {
    const clingoOutput = await this.run(query);

    return this.parseClingoResult(clingoOutput);
  }

  /**
   * Runs a pre-defined query.
   * @param queryName Name of the query file without extension
   * @param options Any object that contains state for handlebars
   * @returns parsed program output
   */
  public async runQuery<T extends QueryName>(
    queryName: T,
    options?: unknown,
  ): Promise<QueryResult<T>[]> {
    let content = lpFiles.queries[queryName];
    if (options && typeof options === 'object') {
      const handlebars = Handlebars.create();
      const compiled = handlebars.compile(content);
      content = compiled(options);
    }

    if (!content) {
      throw new Error(`Query file ${queryName} not found`);
    }

    const clingoOutput = await this.run(content);

    const result = await this.parseClingoResult(clingoOutput);

    if (result.error) {
      throw new Error(result.error);
    }
    return result.results as QueryResult<T>[];
  }
}
