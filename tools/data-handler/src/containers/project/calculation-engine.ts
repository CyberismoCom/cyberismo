/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2025
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

// node
import { basename, join, resolve } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';

import { sanitizeSvgBase64 } from '../../utils/sanitize-svg.js';
import { instance } from '@viz-js/viz';

import type {
  BaseResult,
  ParseResult,
  QueryName,
  QueryResult,
} from '../../types/queries.js';
import type { Card, Context } from '../../interfaces/project-interfaces.js';
import ClingoParser from '../../utils/clingo-parser.js';
import { pathExists } from '../../utils/file-utils.js';
import { Mutex } from 'async-mutex';
import Handlebars from 'handlebars';
import { type Project, ResourcesFrom } from '../../containers/project.js';
import { getChildLogger } from '../../utils/log-utils.js';
import {
  createCardFacts,
  createCardTypeFacts,
  createContextFacts,
  createFieldTypeFacts,
  createLinkTypeFacts,
  createModuleFacts,
  createProjectFacts,
  createReportFacts,
  createTemplateFacts,
  createWorkflowFacts,
} from '../../utils/clingo-facts.js';
import { CardMetadataUpdater } from '../../card-metadata-updater.js';
import type {
  CardType,
  FieldType,
  LinkType,
  ReportMetadata,
  TemplateMetadata,
  Workflow,
} from '../../interfaces/resource-interfaces.js';
import {
  removeAllPrograms,
  solve,
  setProgram,
  removeProgram,
  buildProgram,
} from '@cyberismo/node-clingo';
import { generateReportContent } from '../../utils/report.js';
import { lpFiles, graphvizReport } from '@cyberismo/assets';
import {
  type ResourceName,
  resourceNameToString,
} from '../../utils/resource-utils.js';

// Define the all category that will be used for all programs
const ALL_CATEGORY = 'all';

export class CalculationEngine {
  constructor(private project: Project) {}

  private static mutex = new Mutex();

  private get logger() {
    return getChildLogger({
      module: 'calculate',
    });
  }

  // Storage for in-memory program content
  private modules: string = '';

  private modulesInitialized = false;

  // Initialize modules during construction
  private async initializeModules() {
    try {
      // Collect all available calculations at initialization time
      this.modules = await this.generateModules();
      this.modulesInitialized = true;
    } catch (error) {
      this.logger.error(error, 'Failed to initialize modules');
    }
  }

  /**
   * Gets the logic program content for a specific card
   * @param cardKey The key of the card
   * @returns The logic program content for the card
   */
  public async cardLogicProgram(cardKey: string): Promise<string> {
    const card = await this.project.findSpecificCard(cardKey, {
      metadata: true,
    });
    if (!card) {
      throw new Error(`Card '${cardKey}' does not exist in the project`);
    }
    return createCardFacts(card, this.project);
  }

  /**
   * Exports logic program to a given file
   * @param destination Destination file path
   * @param programs Programs or categories to export
   * @param query Query to export, if not provided, all programs will be exported
   */
  public async exportLogicProgram(
    destination: string,
    programs: string[],
    query?: QueryName,
  ) {
    let logicProgram = query ? this.queryContent(query) : '';
    logicProgram += await buildProgram('', programs);
    await writeFile(destination, logicProgram);
  }

  // // Wrapper to run onCreation query.
  private async creationQuery(cardKeys: string[], context: Context) {
    if (!cardKeys) return undefined;
    return this.runQuery('onCreation', context, {
      cardKeys,
    });
  }

  // Generate card tree content
  private async setCardTreeContent() {
    const cards = await this.getCards(undefined);

    for (const card of cards) {
      await this.setCardContent(card);
    }
  }

  private async setCardContent(card: Card) {
    const cardContent = await createCardFacts(card, this.project);
    setProgram(card.key, cardContent, [ALL_CATEGORY]);
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

  // Sets individual CardType programs
  private async setCardTypesPrograms() {
    const cardTypes = await this.project.cardTypes();

    for (const cardType of await Promise.all(
      cardTypes.map((c) => this.project.resource<CardType>(c.name)),
    )) {
      if (!cardType) continue;

      const cardTypeContent = createCardTypeFacts(cardType);
      setProgram(cardType.name, cardTypeContent, [ALL_CATEGORY]);
    }
  }

  // Sets individual FieldType programs
  private async setFieldTypesPrograms() {
    const fieldTypes = await this.project.fieldTypes();

    for (const fieldType of await Promise.all(
      fieldTypes.map((m) => this.project.resource<FieldType>(m.name)),
    )) {
      if (!fieldType) continue;

      const fieldTypeContent = createFieldTypeFacts(fieldType);
      setProgram(fieldType.name, fieldTypeContent, [ALL_CATEGORY]);
    }
  }

  // Sets individual LinkType programs
  private async setLinkTypesPrograms() {
    const linkTypes = await this.project.linkTypes();

    for (const linkType of await Promise.all(
      linkTypes.map((c) => this.project.resource<LinkType>(c.name)),
    )) {
      if (!linkType) continue;

      const linkTypeContent = createLinkTypeFacts(linkType);
      setProgram(linkType.name, linkTypeContent, [ALL_CATEGORY]);
    }
  }

  // Sets individual Workflow programs
  private async setWorkflowsPrograms() {
    const workflows = await this.project.workflows();

    for (const workflow of await Promise.all(
      workflows.map((m) => this.project.resource<Workflow>(m.name)),
    )) {
      if (!workflow) continue;

      const workflowContent = createWorkflowFacts(workflow);
      setProgram(workflow.name, workflowContent, [ALL_CATEGORY]);
    }
  }

  // Sets individual Report programs
  private async setReportsPrograms() {
    const reports = await this.project.reports();

    for (const report of await Promise.all(
      reports.map((r) => this.project.resource<ReportMetadata>(r.name)),
    )) {
      if (!report) continue;

      const reportContent = createReportFacts(report);
      setProgram(report.name, reportContent, [ALL_CATEGORY]);
    }
  }

  // Sets individual Template programs
  private async setTemplatesPrograms() {
    const templates = await this.project.templates();

    for (const template of await Promise.all(
      templates.map((r) => this.project.resource<TemplateMetadata>(r.name)),
    )) {
      if (!template) continue;

      const templateContent = createTemplateFacts(template);
      const cards = await this.getCards(template.name);
      for (const card of cards) {
        const cardContent = await createCardFacts(card, this.project);
        setProgram(card.key, cardContent, [ALL_CATEGORY]);
      }
      setProgram(template.name, templateContent, [ALL_CATEGORY]);
    }
  }

  // Sets individual Calculation programs
  private async setCalculationsPrograms() {
    const calculations = await this.project.calculations(ResourcesFrom.all);

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
            setProgram(calculationFile.name, moduleContent, [ALL_CATEGORY]);
          } catch (error) {
            this.logger.warn(
              error,
              `Failed to read calculation ${calculationFile.name}`,
            );
          }
        }
      }
    }
  }

  // Gets either all the cards (no parent), or a subtree.
  private async getCards(templateName?: string): Promise<Card[]> {
    return templateName
      ? this.project.templateCards(templateName)
      : this.project.cards();
  }

  // Checks that Clingo successfully returned result.
  private async parseClingoResult(
    data: string[],
  ): Promise<ParseResult<BaseResult>> {
    const parser = new ClingoParser();
    return parser.parseInput(data.join('\n'));
  }

  private async run(query: string, context: Context): Promise<string[]> {
    try {
      const res = await CalculationEngine.mutex.runExclusive(async () => {
        // Use the main category to include all programs
        const basePrograms = [ALL_CATEGORY];

        this.logger.trace(
          {
            clingo: true,
          },
          'Solving',
        );

        const contextFacts = createContextFacts(context);
        setProgram('context', contextFacts, [ALL_CATEGORY]);
        // Then solve with the program - need to pass the program as parameter
        return solve(query, basePrograms);
      });

      if (res && res.answers && res.answers.length > 0) {
        return res.answers;
      }
      throw new Error('Failed to run Clingo solve. No answers returned.');
    } catch (error) {
      this.logger.error(
        {
          error,
          query,
        },
        'Clingo solve failed',
      );
      throw error;
    }
  }

  /**
   * Generates a logic program.
   */
  public async generate() {
    await CalculationEngine.mutex.runExclusive(async () => {
      this.logger.trace(
        {
          clingo: true,
        },
        'Generating logic program',
      );
      removeAllPrograms();

      if (!this.modulesInitialized) {
        await this.initializeModules();
      }

      // Set base common programs with main category
      setProgram('base', lpFiles.common.base, [ALL_CATEGORY]);
      setProgram('queryLanguage', lpFiles.common.queryLanguage, [ALL_CATEGORY]);
      setProgram('utils', lpFiles.common.utils, [ALL_CATEGORY]);
      setProgram('modules', this.modules, [ALL_CATEGORY]);

      // Set individual resource type programs
      await this.setCardTreeContent();
      await this.setCardTypesPrograms();
      await this.setFieldTypesPrograms();
      await this.setLinkTypesPrograms();
      await this.setWorkflowsPrograms();
      await this.setReportsPrograms();
      await this.setTemplatesPrograms();
      await this.setCalculationsPrograms();

      this.logger.trace(
        {
          clingo: true,
        },
        'Logic program set',
      );
    });
  }

  /**
   * When card changes, update the card specific calculations.
   * @param changedCard Card that was changed.
   */
  public async handleCardChanged(changedCard: Card) {
    await CalculationEngine.mutex.runExclusive(async () => {
      await this.setCardContent(changedCard);
    });
  }

  /**
   * When cards are removed, automatically remove card-specific calculations.
   * @param deletedCard Card that is to be removed.
   */
  public async handleDeleteCard(deletedCard: Card) {
    if (!deletedCard) {
      return;
    }
    try {
      await CalculationEngine.mutex.runExclusive(async () => {
        if (!removeProgram(deletedCard.key)) {
          this.logger.warn(
            {
              cardKey: deletedCard.key,
            },
            'Tried to remove card program that does not exist',
          );
        }
      });
    } catch {
      this.logger.warn('Removing program failed');
    }
  }

  /**
   * When new cards are added, automatically calculate card-specific values.
   * @param cards Added cards.
   */
  public async handleNewCards(cards: Card[]) {
    if (!cards) {
      return;
    }
    await CalculationEngine.mutex.runExclusive(async () => {
      for (const card of cards) {
        await this.setCardContent(card);
      }
    });
    const cardKeys = cards.map((item) => item.key);
    const queryResult = await this.creationQuery(cardKeys, 'localApp');
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
   * Gets the logic program content for a specific resource
   * @param resourceName The name of the resource
   * @returns The logic program content for the resource
   */
  public async resourceLogicProgram(
    resourceName: ResourceName,
  ): Promise<string> {
    const resource = await this.project.resource(
      resourceNameToString(resourceName),
    );
    if (!resource) {
      throw new Error(
        `Resource '${resourceNameToString(resourceName)}' does not exist in the project`,
      );
    }

    switch (resourceName.type) {
      case 'cardTypes':
        return createCardTypeFacts(resource as CardType);
      case 'fieldTypes':
        return createFieldTypeFacts(resource as FieldType);
      case 'linkTypes':
        return createLinkTypeFacts(resource as LinkType);
      case 'workflows':
        return createWorkflowFacts(resource as Workflow);
      case 'reports':
        return createReportFacts(resource as ReportMetadata);
      case 'templates':
        return createTemplateFacts(resource as TemplateMetadata);
      default:
        throw new Error(
          `Resource ${resourceNameToString(resourceName)} does not have a logic program`,
        );
    }
  }

  /**
   * Runs given logic program and creates a graph using clingraph
   * @param data Provide a query or/and a file which can be given to clingraph
   * @param timeout Maximum amount of milliseconds clingraph is allowed to run
   * @returns a base64 encoded image as a string
   */
  public async runGraph(model: string, view: string, context: Context) {
    this.logger.trace(
      {
        model,
        view,
      },
      'Running graph',
    );

    const result = await generateReportContent({
      calculate: this,
      contentTemplate: graphvizReport.content,
      queryTemplate: graphvizReport.query,
      options: {
        model: model,
        view: view,
      },
      graph: true,
      context,
    });
    let graph = (await instance()).renderString(result, {
      format: 'svg',
    });

    // asciidoctor-pdf will error on the a elements with xtitle attribute
    // because of the unescaped <font> tags.
    if (context === 'exportedDocument') {
      graph = graph.replace(/xlink:title="[^"]*"/g, '');
    }
    return sanitizeSvgBase64(graph);
  }

  /**
   * Runs a logic program using clingo.
   * @param query Logic program to be run
   * @returns parsed program output
   */
  public async runLogicProgram(query: string, context: Context = 'localApp') {
    const clingoOutput = await this.run(query, context);
    return this.parseClingoResult(clingoOutput);
  }

  private queryContent(queryName: QueryName, options?: unknown) {
    const content = lpFiles.queries[queryName];
    const handlebars = Handlebars.create();
    const compiled = handlebars.compile(content);
    return compiled(options || {});
  }

  /**
   * Runs a pre-defined query.
   * @param queryName Name of the query file without extension
   * @param options Any object that contains state for handlebars
   * @returns parsed program output
   */
  public async runQuery<T extends QueryName>(
    queryName: T,
    context: Context = 'localApp',
    options?: unknown,
  ): Promise<QueryResult<T>[]> {
    const content = this.queryContent(queryName, options);

    this.logger.trace({ queryName }, 'Running query');
    const clingoOutput = await this.run(content, context);

    const result = await this.parseClingoResult(clingoOutput);

    if (result.error) {
      throw new Error(result.error);
    }
    return result.results as QueryResult<T>[];
  }
}
