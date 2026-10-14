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

import type { Workflow } from '@cyberismo/model';

import type { Checkout } from '../containers/project.js';

import { read } from '../utils/rw-lock.js';

/**
 * Show command.
 */
export class Show {
  constructor(private checkout: Checkout) {}

  /**
   * Shows all workflows with full details in a project.
   * @returns workflows with full details
   */
  @read
  public async showWorkflowsWithDetails(): Promise<(Workflow | undefined)[]> {
    const workflows = [];
    for (const workflow of this.checkout.resources.workflows()) {
      workflows.push(workflow.data);
    }
    return structuredClone(workflows);
  }
}
