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
import { writeFile } from 'node:fs/promises';

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
import { Mutex } from 'async-mutex';
import Handlebars from 'handlebars';
import type { Project } from '../../containers/project.js';
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
    const card = this.project.findCard(cardKey);
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
    logicProgram += buildProgram('', programs);
    await writeFile(destination, logicProgram);
  }

  // Wrapper to run onCreation query.
  private async creationQuery(cardKeys: string[], context: Context) {
    if (!cardKeys) return undefined;
    return this.runQuery('onCreation', context, {
      cardKeys,
    });
  }

  // Generate card tree content
  private async setCardTreeContent() {
    const cards = this.getCards(undefined);
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
    const modules = this.project.resources.moduleNames();
    let content = '';
    for (const module of await Promise.all(
      modules.map((mod) => this.project.module(mod)),
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
    const cardTypes = this.project.resources.cardTypes();
    for (const cardType of cardTypes) {
      const ct = await cardType.show();
      if (ct) {
        const cardTypeContent = createCardTypeFacts(ct);
        setProgram(ct.name, cardTypeContent, [ALL_CATEGORY]);
      }
    }
  }

  // Sets individual FieldType programs
  private async setFieldTypesPrograms() {
    const fieldTypes = this.project.resources.fieldTypes();
    for (const fieldType of fieldTypes) {
      const ft = await fieldType.show();
      if (ft) {
        const fieldTypeContent = createFieldTypeFacts(ft);
        setProgram(ft.name, fieldTypeContent, [ALL_CATEGORY]);
      }
    }
  }

  // Sets individual LinkType programs
  private async setLinkTypesPrograms() {
    const linkTypes = this.project.resources.linkTypes();
    for (const linkType of linkTypes) {
      const lt = await linkType.show();
      if (lt) {
        const linkTypeContent = createLinkTypeFacts(lt);
        setProgram(lt.name, linkTypeContent, [ALL_CATEGORY]);
      }
    }
  }

  // Sets individual Workflow programs
  private async setWorkflowsPrograms() {
    const workflows = this.project.resources.workflows();
    for (const workflow of workflows) {
      const wf = await workflow.show();
      if (wf) {
        const workflowContent = createWorkflowFacts(wf);
        setProgram(wf.name, workflowContent, [ALL_CATEGORY]);
      }
    }
  }

  // Sets individual Report programs
  private async setReportsPrograms() {
    const reports = this.project.resources.reports();
    for (const report of reports) {
      const rep = await report.show();
      if (rep) {
        const reportContent = createReportFacts(rep);
        setProgram(rep.name, reportContent, [ALL_CATEGORY]);
      }
    }
  }

  // Sets individual Template programs
  private async setTemplatesPrograms() {
    const templates = this.project.resources.templates();
    for (const template of templates) {
      const tem = await template.show();
      if (tem) {
        const templateContent = createTemplateFacts(tem);
        const cards = this.getCards(tem.name);
        for (const card of cards) {
          const cardContent = await createCardFacts(card, this.project);
          setProgram(card.key, cardContent, [ALL_CATEGORY]);
        }
        setProgram(tem.name, templateContent, [ALL_CATEGORY]);
      }
    }
  }

  // Sets individual Calculation programs
  private async setCalculationsPrograms() {
    const calculations = this.project.resources.calculations();
    for (const calculation of calculations) {
      try {
        if (calculation) {
          const resource = await calculation.contentData();
          const calc = await calculation.show();
          if (!resource.calculation) {
            this.logger.info(
              `Calculation resource '${calc.name}' does not have calculation file`,
            );
            continue;
          }
          setProgram(calc.name, resource.calculation, [ALL_CATEGORY]);
        }
      } catch (error) {
        this.logger.warn(
          error,
          `Failed to read calculation ${calculation.data!.name}`,
        );
      }
    }
  }

  // Gets either all the cards (no parent), or a subtree.
  private getCards(templateName?: string): Card[] {
    if (templateName) {
      return this.project.templateCards(templateName);
    }

    return this.project.cards();
  }

  // Checks that Clingo successfully returned result.
  private async parseClingoResult(
    data: string[],
  ): Promise<ParseResult<BaseResult>> {
    const parser = new ClingoParser();
    return parser.parseInput(data.join('\n'));
  }

  //
  private queryContent(queryName: QueryName, options?: unknown) {
    const content = lpFiles.queries[queryName];
    const handlebars = Handlebars.create();
    const compiled = handlebars.compile(content);
    return compiled(options || {});
  }

  //
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
   * When card is moved, rebuild the entire card tree structure.
   * Moving cards changes parent-child relationships, so we need to rebuild
   * the complete card tree facts to ensure consistency.
   */
  public async handleCardMoved() {
    await CalculationEngine.mutex.runExclusive(async () => {
      // Rebuild entire tree structure from scratch to ensure all relationships are correct
      await this.setCardTreeContent();
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
    const resource = this.project.resources.byType(resourceName).data;
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
        return '';
    }
  }

  /**
   * Runs given logic program and creates a graph using clingraph
   * @param model Graph model to use.
   * @param view Graph view to use.
   * @param context In which type of context the query is run.
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
   * @param context In which type of context the query is run.
   * @returns parsed program output
   */
  public async runLogicProgram(query: string, context: Context = 'localApp') {
    const clingoOutput = await this.run(query, context);
    return this.parseClingoResult(clingoOutput);
  }

  /**
   * Runs a pre-defined query.
   * @param queryName Name of the query file without extension
   * @param context In which type of context the query is run.
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
