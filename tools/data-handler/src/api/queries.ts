// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import Handlebars from 'handlebars';
import { workflowGraph } from '@cyberismo/assets';

import { queries } from '@cyberismo/model';
import type {
  Context,
  LinkCandidate,
  QueryName,
  QueryResult,
  ReportParameters,
  ResourceName,
} from '@cyberismo/model';
import type { Checkout } from '../state/checkout/checkout.js';
import {
  CardNotFoundError,
  DHValidationError,
} from '../shared/exceptions/index.js';
import {
  evaluateMacros,
  renderGraph,
  ReportMacro,
  TaskQueue,
  validateGraphOptions,
} from '../domain/macros/index.js';
import { hasCard } from '../domain/cards/index.js';
import {
  registerClingoHelpers,
  toLinkCandidates,
} from '../domain/queries/index.js';
import { read } from '../infra/tx/rw-lock.js';

// A card key as the project makes them: prefix, separator, base-36 suffix.
const CARD_KEY = /^[a-z]+_[a-z0-9]+$/;

/** A graph to render from graph model and graph view resources. */
export interface GraphRequest {
  /** Graph model resource name. */
  model: string;
  /** Graph view resource name. */
  view: string;
  /** Card the graph is drawn for; must exist. */
  cardKey?: string;
  /** Parameters of the view, checked against the view's schema. */
  parameters?: Record<string, unknown>;
}

const workflowGraphHandlebars = Handlebars.create();
registerClingoHelpers(workflowGraphHandlebars);
const workflowGraphView = workflowGraphHandlebars.compile<{
  workflow: string;
  currentState?: string;
}>(workflowGraph.view);

/**
 * Queries and logic programs of one handle. Holds no state of its own.
 */
export class Queries {
  /** @internal */
  constructor(private checkout: Checkout) {}

  /**
   * The project's whole logic program, with a named query first if given.
   * @throws if the query is not a known one.
   */
  @read
  public async program(query?: string): Promise<string> {
    if (query && !(queries as readonly string[]).includes(query)) {
      throw new DHValidationError(
        `Unknown query '${query}'. Must be one of: ${queries.join(', ')}`,
      );
    }
    return this.checkout.calculationEngine.logicProgram(
      query as QueryName | undefined,
    );
  }

  /**
   * Renders a graph from a graph model and a graph view resource, the way
   * the graph macro does in card content.
   * @param request Model and view resource names, the card the graph is
   *   drawn for (filled into the view's `{{cardKey}}`), and the view's
   *   parameters, checked against the view's schema.
   * @param context In which type of context the graph is rendered.
   * @returns base64-encoded sanitized SVG.
   * @throws if a resource or the card does not exist, the parameters do not
   *   validate or the logic program fails.
   */
  @read
  public async runGraph(
    request: GraphRequest,
    context: Context = 'localApp',
  ): Promise<string> {
    const { model, view, cardKey, parameters } = request;
    if (cardKey !== undefined) {
      this.assertCardsExist([cardKey]);
    }
    const options = validateGraphOptions(this.checkout, {
      ...parameters,
      model,
      view,
    });
    return renderGraph(this.checkout, options, cardKey, context);
  }

  /**
   * Renders the built-in workflow state-machine graph for a single workflow.
   * @param workflowName Fully qualified workflow resource name (e.g. "base/workflows/foo").
   * @param options Optional `currentState` to highlight, and Clingo `context`.
   * @returns base64-encoded sanitized SVG string.
   */
  @read
  public async runWorkflowGraph(
    workflowName: string,
    options: { currentState?: string; context?: Context } = {},
  ) {
    const view = workflowGraphView({
      workflow: workflowName,
      currentState: options.currentState,
    });
    return this.checkout.calculationEngine.runGraph(
      workflowGraph.model,
      view,
      options.context ?? 'localApp',
    );
  }

  /**
   * Runs a logic program using clingo.
   * @param query Logic program to be run; a mistake in it is invalid.
   * @returns parsed program output
   */
  @read
  public async runLogicProgram(query: string, context: Context = 'localApp') {
    return this.checkout.calculationEngine.runLogicProgram(
      query,
      context,
      true,
    );
  }

  /**
   * Runs a logic program and lists the card and connector rows it returns.
   * @param query Logic program to be run
   * @throws DHValidationError if the query language rejects the program.
   */
  @read
  public async linkCandidates(query: string): Promise<LinkCandidate[]> {
    const { results, error } = await this.runLogicProgram(query);
    if (error) {
      throw new DHValidationError(error);
    }
    return toLinkCandidates(results);
  }

  /**
   * Runs a pre-defined query.
   * @param queryName Name of the query file without extension
   * @param options Any object that contains state for handlebars. Card keys
   *   in `cardKey` and `cardKeys` must be well formed, but are not checked
   *   against the project: callers check `cards.has` where it matters.
   *   `onTransition` needs `cardKey` and `transition`, `onCreation` needs
   *   `cardKeys`.
   * @returns parsed program output
   * @throws DHValidationError if a required option is missing or a card key
   *   is malformed.
   */
  @read
  public async runQuery<T extends QueryName>(
    queryName: T,
    context: Context = 'localApp',
    options?: unknown,
  ): Promise<QueryResult<T>[]> {
    this.validateQueryOptions(queryName, options);
    return this.checkout.calculationEngine.runQuery(
      queryName,
      context,
      options,
    );
  }

  /** The logic program of a resource. */
  @read
  public async logicProgram(resource: ResourceName): Promise<string> {
    return this.checkout.calculationEngine.resourceLogicProgram(resource);
  }

  /**
   * Runs a report for the card named in its parameters.
   * @throws if the report does not exist, or the name, the parameters or
   *   their card key is missing.
   */
  @read
  public async runReport(
    reportName: string,
    parameters: ReportParameters,
    context: Context,
  ): Promise<string> {
    // Validate the parameters file.
    if (!reportName) {
      throw new DHValidationError(
        'The parameters file must include a "name" field (report name).',
      );
    }
    if (!parameters) {
      throw new DHValidationError(
        'The parameters file must include a "parameters" field (report parameters).',
      );
    }
    if (!parameters.cardKey) {
      throw new DHValidationError(
        'The parameters file must include a "cardKey" field included in the "parameters".',
      );
    }
    const cardKey = parameters.cardKey;

    if (
      !this.checkout.resources
        .reports()
        .some((report) => report.data?.name === reportName)
    ) {
      throw new Error(`Report '${reportName}' does not exist`);
    }

    const reportMacro = new ReportMacro(new TaskQueue());
    let result = await reportMacro.handleStatic(
      {
        checkout: this.checkout,
        cardKey: cardKey,
        mode: 'static',
        context,
      },
      { name: reportName, ...parameters },
    );

    result = await evaluateMacros(result, {
      checkout: this.checkout,
      cardKey: cardKey,
      mode: 'static',
      context,
    });

    return result ?? '';
  }

  // Card keys are pasted into the logic program unquoted, so only keys the
  // project holds may reach it.
  private assertCardsExist(cardKeys: string[]) {
    for (const cardKey of cardKeys) {
      if (!hasCard(this.checkout, cardKey)) {
        throw new CardNotFoundError(cardKey);
      }
    }
  }

  private validateQueryOptions(queryName: QueryName, options: unknown) {
    const { cardKey, cardKeys, transition } = (options ?? {}) as {
      cardKey?: unknown;
      cardKeys?: unknown;
      transition?: unknown;
    };
    if (queryName === 'onTransition' && (!cardKey || !transition)) {
      throw new DHValidationError(
        "Query 'onTransition' needs a 'cardKey' and a 'transition'",
      );
    }
    if (
      queryName === 'onCreation' &&
      (!Array.isArray(cardKeys) || cardKeys.length === 0)
    ) {
      throw new DHValidationError("Query 'onCreation' needs 'cardKeys'");
    }
    if (cardKeys !== undefined && !Array.isArray(cardKeys)) {
      throw new DHValidationError("'cardKeys' must be a list of card keys");
    }
    // Card keys are pasted into the logic program unquoted; a well-formed
    // key is a plain constant there and cannot change the program.
    for (const key of [
      ...(cardKey === undefined ? [] : [cardKey]),
      ...((cardKeys as unknown[] | undefined) ?? []),
    ]) {
      if (typeof key !== 'string' || !CARD_KEY.test(key)) {
        throw new DHValidationError(`'${key}' is not a valid card key`);
      }
    }
  }
}
