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
import type { CardNode, Context } from '../../interfaces/project-interfaces.js';
import ClingoParser from '../../utils/clingo-parser.js';

import Handlebars from 'handlebars';
import type { Project, ProjectFactChanges } from '../../containers/project.js';
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
import { ClingoContext } from '@cyberismo/node-clingo';
import { generateReportContent } from '../../utils/report.js';
import { lpFiles, graphvizReport } from '@cyberismo/assets';
import {
  type ResourceName,
  resourceNameToString,
} from '../../utils/resource-utils.js';

// Define the all category that will be used for all programs
const ALL_CATEGORY = 'all';

export class CalculationEngine {
  /**
   * @param project The project whose logic program this engine holds.
   * @param drainCardFactChanges Takes the pending card fact changes of every
   *   tree the project holds. Handed over at construction rather than called
   *   on the project, because taking them is destructive: whoever calls this
   *   owes the changes a projection, and the engine is the only thing that
   *   can pay. Everything else can ask a tree whether it is dirty, but cannot
   *   empty it.
   */
  constructor(
    private project: Project,
    private drainCardFactChanges: () => ProjectFactChanges,
  ) {}

  private clingo = new ClingoContext();

  // Whether everything that is not a card program has to be rebuilt before the
  // next solve. True to begin with, so the first solve builds the program.
  //
  // Card facts depend on card types and field types (which fields are dormant,
  // which are overridable, what a list field's element type is), so a resource
  // change invalidates the card programs too - which is why this flag makes
  // the pull fall back to a full generate rather than a resource-only rebuild.
  private resourcesDirty = true;

  // Serialises the pulls. Reads run concurrently under the project's lock, and
  // draining is destructive: without this a second reader would take an empty
  // change set and solve while the first is still projecting.
  private pulling: Promise<void> = Promise.resolve();

  private get logger() {
    return getChildLogger({
      module: 'calculate',
    });
  }

  /**
   * Declares that something other than a card changed, so the programs derived
   * from resources - and the card programs that depend on them - are stale.
   *
   * Cheap by design: this is called from every resource write and every
   * resource-cache invalidation, and does no work until somebody solves.
   */
  public invalidateResources() {
    this.resourcesDirty = true;
  }

  /**
   * Brings the logic program up to date with the project, and is the only
   * thing that may assume it is.
   *
   * Every path into clingo goes through here: run() for solves, and
   * exportLogicProgram for the one place that reads the assembled program
   * without solving it.
   */
  private async pull(): Promise<void> {
    const next = this.pulling.then(
      () => this.refreshPrograms(),
      // A failed pull must not wedge every later one.
      () => this.refreshPrograms(),
    );
    this.pulling = next.catch(() => {});
    return next;
  }

  private async refreshPrograms(): Promise<void> {
    if (this.resourcesDirty) {
      await this.generate();
      return;
    }
    const { changed, removed } = this.drainCardFactChanges();
    try {
      for (const cardKey of removed) {
        this.clingo.removeProgram(cardKey);
      }
      await this.refreshCardFacts(changed);
    } catch (error) {
      // Draining is destructive: the changes this pull did not get to are
      // gone, and the trees will not report them again. Leaving the engine
      // looking clean would make every later pull take an empty change set
      // and answer from programs that no longer match the project - silently,
      // and for the rest of the process. So the next pull rebuilds everything
      // from the trees as they are now, which is the one thing that cannot
      // have been missed. This is the same shape generate() relies on: clear
      // after success, never before.
      this.resourcesDirty = true;
      throw error;
    }
  }

  /**
   * Gets the logic program content for a specific card
   * @param cardKey The key of the card
   * @returns The logic program content for the card
   */
  public async cardLogicProgram(cardKey: string): Promise<string> {
    const tree = this.project.treeOf(cardKey);
    return createCardFacts(tree.node(cardKey), this.project, tree.factContext);
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
    await this.pull();
    let logicProgram = query ? this.queryContent(query) : '';
    logicProgram += this.clingo.buildProgram('', programs);
    await writeFile(destination, logicProgram);
  }

  /**
   * Runs the onCreation query for the given cards.
   *
   * Answering the query is this class's job; deciding what to do with the
   * answer is not. The caller executes the side effects it asks for, because
   * that is a write the command layer owns.
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

  // Generate card tree content
  private async setCardTreeContent() {
    const cards = this.getCards(undefined);
    for (const card of cards) {
      await this.setCardContent(card);
    }
  }

  private async setCardContent(card: CardNode) {
    const cardContent = await createCardFacts(
      card,
      this.project,
      this.project.treeOf(card.key).factContext,
    );
    this.clingo.setProgram(card.key, cardContent, [ALL_CATEGORY]);
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
      this.clingo.setProgram(cardType.name, cardTypeContent, [ALL_CATEGORY]);
    }
    this.clingo.setProgram(
      'calculatedFields',
      createCalculatedFieldRules(cardTypes),
      [ALL_CATEGORY],
    );
  }

  // Sets individual FieldType programs
  private async setFieldTypesPrograms() {
    const fieldTypes = this.project.resources.fieldTypes();
    for (const fieldType of fieldTypes) {
      const ft = fieldType.show();
      const fieldTypeContent = createFieldTypeFacts(ft);
      this.clingo.setProgram(ft.name, fieldTypeContent, [ALL_CATEGORY]);
    }
  }

  // Sets individual LinkType programs
  private async setLinkTypesPrograms() {
    const linkTypes = this.project.resources.linkTypes();
    for (const linkType of linkTypes) {
      const lt = linkType.show();
      const linkTypeContent = createLinkTypeFacts(lt);
      this.clingo.setProgram(lt.name, linkTypeContent, [ALL_CATEGORY]);
    }
  }

  // Sets individual Workflow programs
  private async setWorkflowsPrograms() {
    const workflows = this.project.resources.workflows();
    for (const workflow of workflows) {
      const wf = workflow.show();
      const workflowContent = createWorkflowFacts(wf);
      this.clingo.setProgram(wf.name, workflowContent, [ALL_CATEGORY]);
    }
  }

  // Sets individual Report programs
  private async setReportsPrograms() {
    const reports = this.project.resources.reports();
    for (const report of reports) {
      const rep = report.show();
      const reportContent = createReportFacts(rep);
      this.clingo.setProgram(rep.name, reportContent, [ALL_CATEGORY]);
    }
  }

  // Sets individual Skill programs
  private async setSkillsPrograms() {
    const skills = this.project.resources.skills();
    for (const skill of skills) {
      const skl = skill.show();
      const skillContent = createSkillFacts(skl);
      this.clingo.setProgram(skl.name, skillContent, [ALL_CATEGORY]);
    }
  }

  // Sets individual Template programs
  private async setTemplatesPrograms() {
    const templates = this.project.resources.templates();
    for (const template of templates) {
      const tem = template.show();
      const templateContent = createTemplateFacts(tem);
      for (const card of this.getCards(tem.name)) {
        await this.setCardContent(card);
      }
      this.clingo.setProgram(tem.name, templateContent, [ALL_CATEGORY]);
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
        this.clingo.setProgram(calc.name, content.calculation, [ALL_CATEGORY]);
      } catch (error) {
        this.logger.warn(
          error,
          `Failed to read calculation ${calculation.data!.name}`,
        );
      }
    }
  }

  // Gets either all the cards (no parent), or a subtree. Fact projection only
  // reads metadata, so the cheap read is enough.
  private getCards(templateName?: string): CardNode[] {
    // Node-level, not hydrated: fact projection reads metadata only, and this
    // runs over every card of every template on the generate() path.
    return templateName
      ? this.project.templateTree(templateName).nodes()
      : this.project.cardTree.nodes();
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
    // The pull point. Every solve in the system comes through here, so this is
    // the one place that has to remember to bring the facts up to date.
    await this.pull();
    try {
      // Use the main category to include all programs
      const basePrograms = [ALL_CATEGORY];

      this.logger.trace(
        {
          clingo: true,
        },
        'Solving',
      );

      // Inline context facts into the query string to avoid race conditions
      // (concurrent reads could overwrite each other's 'context' program key)
      const contextFacts = createContextFacts(context);
      const result = await this.clingo.solve(
        contextFacts + '\n' + query,
        basePrograms,
      );
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
   * Generates the whole logic program from scratch.
   *
   * The fallback the pull takes when something other than a card changed; a
   * card-only change is served incrementally instead.
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
    this.clingo.setProgram('base', lpFiles.common.base, [ALL_CATEGORY]);
    this.clingo.setProgram('queryLanguage', lpFiles.common.queryLanguage, [
      ALL_CATEGORY,
    ]);
    this.clingo.setProgram('utils', lpFiles.common.utils, [ALL_CATEGORY]);
    this.clingo.setProgram('modules', await this.generateModules(), [
      ALL_CATEGORY,
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

    // Everything the trees had pending has just been rebuilt along with the
    // rest, so nothing is owed any more.
    this.drainCardFactChanges();
    this.resourcesDirty = false;

    this.logger.trace(
      {
        clingo: true,
      },
      'Logic program set',
    );
  }

  // Rebuilds the facts of the given cards, so a solve run after this sees them
  // as they are now.
  private async refreshCardFacts(cards: CardNode[]) {
    for (const card of cards) {
      await this.setCardContent(card);
    }
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
