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

import Handlebars from 'handlebars';
import { workflowGraph } from '@cyberismo/assets';

import { queries } from '@cyberismo/model';
import type {
  Context,
  QueryName,
  QueryResult,
  ReportParameters,
  ResourceName,
} from '@cyberismo/model';
import type { Checkout } from '../containers/project.js';
import { DHValidationError } from '../exceptions/index.js';
import ReportMacro from '../macros/report/index.js';
import TaskQueue from '../macros/task-queue.js';
import { evaluateMacros } from '../macros/index.js';
import { registerClingoHelpers } from '../utils/handlebars-helpers.js';
import { read } from '../utils/rw-lock.js';

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
      ['all'],
      query as QueryName | undefined,
    );
  }

  /**
   * Runs given logic program and creates a graph using clingraph
   * @param data Provide a query or/and a file which can be given to clingraph
   * @param timeout Maximum amount of milliseconds clingraph is allowed to run
   * @returns a base64 encoded image as a string
   */
  @read
  public async runGraph(model: string, view: string, context: Context) {
    return this.checkout.calculationEngine.runGraph(model, view, context);
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
   * @param query Logic program to be run
   * @returns parsed program output
   */
  @read
  public async runLogicProgram(query: string, context: Context = 'localApp') {
    return this.checkout.calculationEngine.runLogicProgram(query, context);
  }

  /**
   * Runs a pre-defined query.
   * @param queryName Name of the query file without extension
   * @param options Any object that contains state for handlebars
   * @returns parsed program output
   */
  @read
  public async runQuery<T extends QueryName>(
    queryName: T,
    context: Context = 'localApp',
    options?: unknown,
  ): Promise<QueryResult<T>[]> {
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
}
