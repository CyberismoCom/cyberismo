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

import Handlebars from 'handlebars';
import type { Project } from '../../containers/project.js';
import { getChildLogger } from '../../utils/log-utils.js';
import {
  createCalculatedFieldRules,
  createCardFacts,
  createCardTypeFacts,
  createContextFacts,
  createFieldTypeFacts,
  createLinkTypeFacts,
  createModuleFacts,
  createProjectFacts,
  createReportFacts,
  createSkillFacts,
  createTemplateFacts,
  createWorkflowFacts,
} from '../../utils/clingo-facts.js';
import type {
  CardType,
  FieldType,
  LinkType,
  ReportMetadata,
  SkillMetadata,
  TemplateMetadata,
  Workflow,
} from '../../interfaces/resource-interfaces.js';
import { ClingoContext, ClingoError } from '@cyberismo/node-clingo';
import { generateReportContent } from '../../utils/report.js';
import { lpFiles, graphvizReport } from '@cyberismo/assets';
import {
  type ResourceName,
  resourceNameToString,
} from '../../utils/resource-utils.js';

// Define the all category that will be used for all programs
const ALL_CATEGORY = 'all';
// Programs whose conclusions commit() can snapshot (no #show/#external/etc).
const KNOWLEDGE_CATEGORY = 'knowledge';
// Programs that query the knowledge layer rather than add to it.
const QUERY_LAYER_CATEGORY = 'queryLayer';

export class CalculationEngine {
  constructor(private project: Project) {}

  private clingo = new ClingoContext();

  // Feature flag for the snapshot/commit path; read per instance so tests can
  // toggle it by constructing a fresh engine under a different env value.
  private derivedCacheEnabled = process.env.CYBERISMO_DERIVED_CACHE === '1';

  // Resolves once the current knowledge snapshot is ready to read. Always
  // resolves -- a failed commit() falls back to full solves rather than
  // wedging reads open (see scheduleCommit()).
  private snapshotReady: Promise<void> = Promise.resolve();

  private get logger() {
    return getChildLogger({
      module: 'calculate',
    });
  }

  // Re-solves the knowledge layer after it changed. run() awaits
  // snapshotReady before trying the snapshot path, so a read that follows a
  // write sees the change; a rejected commit just leaves it to fall back.
  private scheduleCommit() {
    if (!this.derivedCacheEnabled) return;
    this.snapshotReady = this.clingo.commit().then(
      (snapshot) => {
        this.logger.trace(
          {
            clingo: true,
            revision: snapshot.revision,
            atoms: snapshot.atoms,
            stats: snapshot.stats,
          },
          'Knowledge snapshot committed',
        );
      },
      (error) => {
        this.logger.warn(
          {
            clingo: true,
            message: error instanceof Error ? error.message : String(error),
            program:
              error instanceof ClingoError ? error.details.program : undefined,
          },
          'Knowledge snapshot failed; reads fall back to full solves',
        );
      },
    );
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
    logicProgram += this.clingo.buildProgram('', programs);
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
    this.clingo.setProgram(card.key, cardContent, [
      ALL_CATEGORY,
      KNOWLEDGE_CATEGORY,
    ]);
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

  // Sets individual CardType programs, plus the calculated field rules that are
  // derived from all of them together.
  private async setCardTypesPrograms() {
    const cardTypes = this.project.resources
      .cardTypes()
      .map((cardType) => cardType.show());
    for (const cardType of cardTypes) {
      const cardTypeContent = createCardTypeFacts(cardType);
      this.clingo.setProgram(cardType.name, cardTypeContent, [
        ALL_CATEGORY,
        KNOWLEDGE_CATEGORY,
      ]);
    }
    this.clingo.setProgram(
      'calculatedFields',
      createCalculatedFieldRules(cardTypes),
      [ALL_CATEGORY, KNOWLEDGE_CATEGORY],
    );
  }

  // Sets individual FieldType programs
  private async setFieldTypesPrograms() {
    const fieldTypes = this.project.resources.fieldTypes();
    for (const fieldType of fieldTypes) {
      const ft = fieldType.show();
      const fieldTypeContent = createFieldTypeFacts(ft);
      this.clingo.setProgram(ft.name, fieldTypeContent, [
        ALL_CATEGORY,
        KNOWLEDGE_CATEGORY,
      ]);
    }
  }

  // Sets individual LinkType programs
  private async setLinkTypesPrograms() {
    const linkTypes = this.project.resources.linkTypes();
    for (const linkType of linkTypes) {
      const lt = linkType.show();
      const linkTypeContent = createLinkTypeFacts(lt);
      this.clingo.setProgram(lt.name, linkTypeContent, [
        ALL_CATEGORY,
        KNOWLEDGE_CATEGORY,
      ]);
    }
  }

  // Sets individual Workflow programs
  private async setWorkflowsPrograms() {
    const workflows = this.project.resources.workflows();
    for (const workflow of workflows) {
      const wf = workflow.show();
      const workflowContent = createWorkflowFacts(wf);
      this.clingo.setProgram(wf.name, workflowContent, [
        ALL_CATEGORY,
        KNOWLEDGE_CATEGORY,
      ]);
    }
  }

  // Sets individual Report programs
  private async setReportsPrograms() {
    const reports = this.project.resources.reports();
    for (const report of reports) {
      const rep = report.show();
      const reportContent = createReportFacts(rep);
      this.clingo.setProgram(rep.name, reportContent, [
        ALL_CATEGORY,
        KNOWLEDGE_CATEGORY,
      ]);
    }
  }

  // Sets individual Skill programs
  private async setSkillsPrograms() {
    const skills = this.project.resources.skills();
    for (const skill of skills) {
      const skl = skill.show();
      const skillContent = createSkillFacts(skl);
      this.clingo.setProgram(skl.name, skillContent, [
        ALL_CATEGORY,
        KNOWLEDGE_CATEGORY,
      ]);
    }
  }

  // Sets individual Template programs
  private async setTemplatesPrograms() {
    const templates = this.project.resources.templates();
    for (const template of templates) {
      const tem = template.show();
      const templateContent = createTemplateFacts(tem);
      const cards = this.getCards(tem.name);
      for (const card of cards) {
        const cardContent = await createCardFacts(card, this.project);
        this.clingo.setProgram(card.key, cardContent, [
          ALL_CATEGORY,
          KNOWLEDGE_CATEGORY,
        ]);
      }
      this.clingo.setProgram(tem.name, templateContent, [
        ALL_CATEGORY,
        KNOWLEDGE_CATEGORY,
      ]);
    }
  }

  // Sets individual Calculation programs
  private async setCalculationsPrograms() {
    const calculations = this.project.resources.calculations();
    for (const calculation of calculations) {
      try {
        const content = calculation.contentData();
        const calc = calculation.show();
        const validation = calculation.validateLogicProgram(
          content.calculation,
        );
        if (!validation.valid) {
          this.logger.warn(
            { errors: validation.errors },
            `Skipping invalid calculation ${calc.name}`,
          );
          continue;
        }
        this.clingo.setProgram(calc.name, content.calculation, [
          ALL_CATEGORY,
          KNOWLEDGE_CATEGORY,
        ]);
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
      this.logger.trace(
        {
          clingo: true,
        },
        'Solving',
      );

      // Inline context facts into the query string to avoid race conditions
      // (concurrent reads could overwrite each other's 'context' program key)
      const contextFacts = createContextFacts(context);
      const program = contextFacts + '\n' + query;

      let result;
      if (this.derivedCacheEnabled) {
        // A write's commit may still be in flight; wait so this read sees it.
        await this.snapshotReady;
        try {
          result = await this.clingo.solve(program, [QUERY_LAYER_CATEGORY], {
            snapshot: true,
          });
        } catch (error) {
          const code = (error as { code?: string }).code;
          if (code !== 'SNAPSHOT_MISSING' && code !== 'SNAPSHOT_STALE') {
            throw error;
          }
          this.logger.trace(
            { clingo: true, code },
            'Snapshot unavailable, full solve',
          );
          this.scheduleCommit();
          result = await this.clingo.solve(program, [ALL_CATEGORY]);
        }
      } else {
        result = await this.clingo.solve(program, [ALL_CATEGORY]);
      }

      this.logger.trace(
        { stats: result.stats, clingo: true },
        'Solve completed',
      );

      if (result && result.answers && result.answers.length > 0) {
        return result.answers;
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
    this.logger.trace(
      {
        clingo: true,
      },
      'Generating logic program',
    );
    this.clingo.removeAllPrograms();

    // Set base common programs with main category
    this.clingo.setProgram('base', lpFiles.common.base, [
      ALL_CATEGORY,
      KNOWLEDGE_CATEGORY,
    ]);
    this.clingo.setProgram('queryLanguage', lpFiles.common.queryLanguage, [
      ALL_CATEGORY,
      QUERY_LAYER_CATEGORY,
    ]);
    this.clingo.setProgram('utils', lpFiles.common.utils, [
      ALL_CATEGORY,
      QUERY_LAYER_CATEGORY,
    ]);
    this.clingo.setProgram('modules', await this.generateModules(), [
      ALL_CATEGORY,
      KNOWLEDGE_CATEGORY,
    ]);

    // Set individual resource type programs
    await this.setCardTreeContent();
    await this.setCardTypesPrograms();
    await this.setFieldTypesPrograms();
    await this.setLinkTypesPrograms();
    await this.setWorkflowsPrograms();
    await this.setReportsPrograms();
    await this.setSkillsPrograms();
    await this.setTemplatesPrograms();
    await this.setCalculationsPrograms();

    this.logger.trace(
      {
        clingo: true,
      },
      'Logic program set',
    );

    this.scheduleCommit();
    // Hold the write lock until the snapshot is ready, so a read that
    // follows this write sees it.
    await this.snapshotReady;
  }

  /**
   * When card changes, update the card specific calculations.
   * @param changedCard Card that was changed.
   */
  public async handleCardChanged(changedCard: Card) {
    await this.setCardContent(changedCard);
    this.scheduleCommit();
  }

  /**
   * When card is moved, rebuild the entire card tree structure.
   * Moving cards changes parent-child relationships, so we need to rebuild
   * the complete card tree facts to ensure consistency.
   */
  public async handleCardMoved() {
    // Rebuild entire tree structure from scratch to ensure all relationships are correct
    await this.setCardTreeContent();
    this.scheduleCommit();
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
      if (!this.clingo.removeProgram(deletedCard.key)) {
        this.logger.warn(
          {
            cardKey: deletedCard.key,
          },
          'Tried to remove card program that does not exist',
        );
      }
    } catch {
      this.logger.warn('Removing program failed');
    }
    this.scheduleCommit();
  }

  /**
   * When new cards are added, automatically calculate card-specific values.
   * @param cards Added cards.
   */
  public async handleNewCards(cards: Card[]) {
    if (!cards) {
      return;
    }
    for (const card of cards) {
      await this.setCardContent(card);
    }
    // Commit before the creation query below, so it sees the new cards on
    // the snapshot path.
    this.scheduleCommit();
    const cardKeys = cards.map((item) => item.key);
    const queryResult = await this.creationQuery(cardKeys, 'localApp');
    await this.project.executeSideEffects(
      queryResult?.at(0),
      // Empty seed: the created cards' initial "Create" transitions already
      // happened during creation itself; a re-entrant "Create" side effect
      // would be rejected anyway by the fromState check, so nothing needs
      // to be pre-marked visited here.
      new Set<string>(),
    );
  }

  /**
   * Gets the logic program content for a specific resource
   * @param resourceName The name of the resource
   * @returns The logic program content for the resource
   */
  public async resourceLogicProgram(
    resourceName: ResourceName,
  ): Promise<string> {
    let resource;
    try {
      resource = this.project.resources.byType(resourceName).data;
    } catch {
      resource = undefined;
    }
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
      case 'skills':
        return createSkillFacts(resource as SkillMetadata);
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
