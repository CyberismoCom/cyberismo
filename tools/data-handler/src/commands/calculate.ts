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

import type { Context } from '../interfaces/project-interfaces.js';
import type { Project } from '../containers/project.js';
import type { QueryName, QueryResult } from '../types/queries.js';
import { read } from '../utils/rw-lock.js';

// Class that calculates with logic program card / project level calculations.
export class Calculate {
  constructor(private project: Project) {}

  /**
   * Exports logic program to a given file
   * @param destination Destination file path
   * @param programs Programs or categories to export
   * @param query Query to export, if not provided, all programs will be exported
   */
  @read
  public async exportLogicProgram(
    destination: string,
    programs: string[] = ['all'],
    query?: QueryName,
  ) {
    await this.project.calculationEngine.exportLogicProgram(
      destination,
      programs,
      query,
    );
  }

  /**
   * Generates a logic program.
   */
  @read
  public async generate() {
    return this.project.calculationEngine.generate();
  }

  /**
   * Runs given logic program and creates a graph using clingraph
   * @param data Provide a query or/and a file which can be given to clingraph
   * @param timeout Maximum amount of milliseconds clingraph is allowed to run
   * @returns a base64 encoded image as a string
   */
  @read
  public async runGraph(model: string, view: string, context: Context) {
    return this.project.calculationEngine.runGraph(model, view, context);
  }

  /**
   * Runs a logic program using clingo.
   * @param query Logic program to be run
   * @returns parsed program output
   */
  @read
  public async runLogicProgram(query: string, context: Context = 'localApp') {
    return this.project.calculationEngine.runLogicProgram(query, context);
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
    return this.project.lock.read(async () =>
      this.project.calculationEngine.runQuery(queryName, context, options),
    );
  }
}
