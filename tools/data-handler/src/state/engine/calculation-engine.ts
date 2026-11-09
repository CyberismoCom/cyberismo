// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

// node

import { sanitizeSvgBase64 } from '../../shared/utils/sanitize-svg.js';
import { instance } from '@viz-js/viz';

import type {
  BaseResult,
  ParseResult,
  QueryName,
  QueryResult,
  Card,
  CardNode,
  Context,
  CardType,
  FieldType,
  LinkType,
  ReportMetadata,
  SkillMetadata,
  TemplateMetadata,
  Workflow,
  ResourceName,
} from '@cyberismo/model';
import ClingoParser from '../../infra/engine/clingo-parser.js';

import Handlebars from 'handlebars';
import type { Checkout } from '../checkout/checkout.js';
import { getChildLogger } from '../../shared/utils/log-utils.js';
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
} from './clingo-facts.js';
import type {
  LogicBackend,
  LogicTransaction,
  Program,
} from '../../infra/logic/logic-backend.js';
import { generateReportContent } from '../../domain/queries/report.js';
import { lpFiles, graphvizReport } from '@cyberismo/assets';
import { resourceNameToString } from '../../shared/utils/resource-utils.js';

// Builds a program that describes the project.
const knowledge = (key: string, text: string): Program => ({
  key,
  role: 'knowledge',
  text,
});

export class CalculationEngine {
  // The write's transaction, opened by its first change of a program.
  private tx?: Promise<LogicTransaction>;

  /** @internal */
  constructor(
    private checkout: Checkout,
    private backend: LogicBackend,
  ) {}

  private get logger() {
    return getChildLogger({
      module: 'calculate',
    });
  }

  /**
   * Gets the logic program content for a specific card
   * @param cardKey The key of the card
   * @returns The logic program content for the card
   */
  public async cardLogicProgram(cardKey: string): Promise<string> {
    const tree = this.checkout.treeOf(cardKey);
    return createCardFacts(tree.node(cardKey), this.checkout, tree.factContext);
  }

  /**
   * The project's whole logic program.
   * @param query Query to put first, if any
   */
  public async logicProgram(query?: QueryName): Promise<string> {
    const program = await this.backend.exportText();
    return query ? this.queryContent(query) + program : program;
  }

  /**
   * Checks logic programs, each on its own, without keeping them.
   * @returns the problems found; one with severity error refuses a program.
   */
  public async check(programs: Program[]) {
    return this.backend.check(programs);
  }

  /**
   * Runs the onCreation query for the given cards.
   *
   * Answering the query is this class's job; executing the side effects it
   * asks for is a write the command layer owns.
   * @param cardKeys Keys of the cards that were created.
   * @param context In which type of context the query is run.
   * @returns the query's side effects, or undefined if there are none.
   */
  public async creationQuery(
    cardKeys: string[],
    context: Context,
  ): Promise<QueryResult<'onCreation'>[] | undefined> {
    if (!cardKeys) return undefined;
    return this.runQuery('onCreation', context, {
      cardKeys,
    });
  }

  private transaction(): Promise<LogicTransaction> {
    this.tx ??= this.backend.begin();
    return this.tx;
  }

  private async cardProgram(card: CardNode): Promise<Program> {
    const text = await createCardFacts(
      card,
      this.checkout,
      this.checkout.treeOf(card.key).factContext,
    );
    return knowledge(card.key, text);
  }

  // Generates logic programs related to modules (and project itself).
  private async generateModules() {
    const modules = this.checkout.resources.moduleNames();
    let content = '';
    for (const module of await Promise.all(
      modules.map((mod) => this.checkout.module(mod)),
    )) {
      if (!module) continue;
      const moduleContent = createModuleFacts(module);
      content = content.concat(moduleContent);
    }
    const projectContent = createProjectFacts(this.checkout.projectPrefix);
    content = content.concat(projectContent);
    return content;
  }

  // The calculations that are valid on their own; the others are skipped.
  private async calculationPrograms(): Promise<Program[]> {
    const programs: Program[] = [];
    for (const calculation of this.checkout.resources.calculations()) {
      try {
        const name = calculation.show().name;
        programs.push(
          knowledge(name, calculation.contentData().calculation ?? ''),
        );
      } catch (error) {
        this.logger.warn(
          error,
          `Failed to read calculation ${calculation.data!.name}`,
        );
      }
    }
    const diagnostics = await this.backend.check(programs);
    const invalid = new Set(
      diagnostics.filter((d) => d.severity === 'error').map((d) => d.key),
    );
    for (const key of invalid) {
      this.logger.warn(
        { errors: diagnostics.filter((d) => d.key === key) },
        `Skipping invalid calculation ${key}`,
      );
    }
    return programs.filter((program) => !invalid.has(program.key));
  }

  // Every program, built from the checkout's current state.
  private async allPrograms(): Promise<Program[]> {
    const programs: Program[] = [
      knowledge('base', lpFiles.common.base),
      {
        key: 'queryLanguage',
        role: 'query',
        text: lpFiles.common.queryLanguage,
      },
      { key: 'utils', role: 'query', text: lpFiles.common.utils },
      knowledge('modules', await this.generateModules()),
    ];
    for (const card of this.checkout.cardTree.nodes()) {
      programs.push(await this.cardProgram(card));
    }
    const resources = this.checkout.resources;
    const cardTypes = resources.cardTypes().map((cardType) => cardType.show());
    for (const cardType of cardTypes) {
      programs.push(knowledge(cardType.name, createCardTypeFacts(cardType)));
    }
    programs.push(
      knowledge('calculatedFields', createCalculatedFieldRules(cardTypes)),
    );
    for (const fieldType of resources.fieldTypes().map((r) => r.show())) {
      programs.push(knowledge(fieldType.name, createFieldTypeFacts(fieldType)));
    }
    for (const linkType of resources.linkTypes().map((r) => r.show())) {
      programs.push(knowledge(linkType.name, createLinkTypeFacts(linkType)));
    }
    for (const workflow of resources.workflows().map((r) => r.show())) {
      programs.push(knowledge(workflow.name, createWorkflowFacts(workflow)));
    }
    for (const report of resources.reports().map((r) => r.show())) {
      programs.push(knowledge(report.name, createReportFacts(report)));
    }
    for (const skill of resources.skills().map((r) => r.show())) {
      programs.push(knowledge(skill.name, createSkillFacts(skill)));
    }
    for (const template of resources.templates().map((r) => r.show())) {
      for (const card of this.checkout.templateTree(template.name).nodes()) {
        programs.push(await this.cardProgram(card));
      }
      programs.push(knowledge(template.name, createTemplateFacts(template)));
    }
    programs.push(...(await this.calculationPrograms()));
    return programs;
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

  // Solves the query with the write's changes when a write has made any.
  private async run(query: string, context: Context): Promise<string[]> {
    try {
      this.logger.trace({ clingo: true }, 'Solving');
      // Inline context facts into the query string to avoid race conditions
      // (concurrent reads could overwrite each other's 'context' program key)
      const text = createContextFacts(context) + '\n' + query;
      const result = this.tx
        ? await (await this.tx).query(text)
        : await this.backend.query(text);
      if (result.answers.length > 0) {
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
   * Rebuilds every program from the checkout's current state and commits
   * them, also when they leave the project without a total answer.
   */
  public async generate() {
    await this.replaceAll(true);
  }

  /**
   * Ends the running write: commits its programs, rebuilt from the checkout's
   * current state, unless the backend refuses the result.
   */
  public async commitWrite() {
    await this.replaceAll(false);
  }

  private async replaceAll(keepNonTotal: boolean) {
    this.logger.trace({ clingo: true }, 'Generating logic program');
    const tx = this.transaction();
    try {
      (await tx).replaceAll(await this.allPrograms());
    } catch (error) {
      await this.abortWrite();
      throw error;
    }
    this.tx = undefined;
    await (await tx).commit({ keepNonTotal });
    this.logger.trace({ clingo: true }, 'Logic program set');
  }

  /**
   * Ends the running write's transaction uncommitted, which leaves the
   * committed programs as they were. Never rejects.
   */
  public async abortWrite() {
    const tx = this.tx;
    if (!tx) {
      return;
    }
    this.tx = undefined;
    try {
      await (await tx).abort();
    } catch (error) {
      this.logger.error({ error }, 'Aborting the logic transaction failed');
    }
  }

  /** Releases the logic backend. */
  public async close() {
    await this.abortWrite();
    await this.backend.close();
  }

  /**
   * When card changes, update the card specific calculations.
   * @param changedCard Card that was changed.
   */
  public async handleCardChanged(changedCard: CardNode) {
    await this.refreshCardFacts([changedCard]);
  }

  /**
   * When card is moved, rebuild the entire card tree structure.
   * Moving cards changes parent-child relationships, so we need to rebuild
   * the complete card tree facts to ensure consistency.
   */
  public async handleCardMoved() {
    await this.refreshCardFacts(this.checkout.cardTree.nodes());
  }

  /**
   * When cards are removed, automatically remove card-specific calculations.
   * @param deletedCard Card that is to be removed.
   */
  public async handleDeleteCard(deletedCard: Card) {
    if (!deletedCard) {
      return;
    }
    (await this.transaction()).remove([deletedCard.key]);
  }

  /**
   * Refreshes the facts of the given cards, so a query run after this sees
   * them as they are now.
   * @param cards Cards whose facts to rebuild.
   */
  public async refreshCardFacts(cards: CardNode[]) {
    if (!cards) {
      return;
    }
    const programs = await Promise.all(
      cards.map((card) => this.cardProgram(card)),
    );
    (await this.transaction()).set(programs);
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
      resource = this.checkout.resources.byType(resourceName).data;
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
