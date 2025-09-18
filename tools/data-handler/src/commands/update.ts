/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import type {
  AddOperation,
  ChangeOperation,
  Operation,
  OperationFor,
  RankOperation,
  RemoveOperation,
  UpdateOperations,
} from '../resources/resource-object.js';
import { Project } from '../containers/project.js';
import { resourceName } from '../utils/resource-utils.js';

/**
 * Class that handles 'update' commands.
 */
export class Update {
  constructor(private project: Project) {}

  /**
   * Updates single resource property.
   * @param name Name of the resource to operate on.
   * @param operation Operation to perform ('add', 'remove', 'change', 'rank')
   * @param key Property to change in resource JSON
   * @param value Value for 'key'
   * @param optionalDetail Additional detail needed for some operations. For example, 'update' needs a new value.
   * @param mappingTable Optional mapping table for workflow state transitions (only used for workflow changes)
   */
  public async updateValue<Type>(
    name: string,
    operation: UpdateOperations,
    key: string,
    value: Type,
    optionalDetail?: Type, // todo: for 'rank' it might be reasonable to accept also 'number'
    mappingTable?: { stateMapping: Record<string, string> },
  ) {
    const op: Operation<Type> = {
      name: operation,
      target: '' as Type,
      to: '' as Type,
      newIndex: 0 as number,
    };

    // Set operation specific properties.
    if (operation === 'add') {
      (op as AddOperation<Type>).target = value;
    } else if (operation === 'change') {
      (op as ChangeOperation<Type>).target = optionalDetail
        ? value
        : (optionalDetail as Type);
      (op as ChangeOperation<Type>).to = optionalDetail
        ? optionalDetail
        : (value as Type);
      // Add mapping table if provided (for workflow changes)
      if (mappingTable) {
        (op as ChangeOperation<Type>).mappingTable = mappingTable;
      }
    } else if (operation === 'rank') {
      (op as RankOperation<Type>).newIndex = optionalDetail as number;
      (op as RankOperation<Type>).target = value;
    } else if (operation === 'remove') {
      (op as RemoveOperation<Type>).target = value;
      (op as RemoveOperation<Type>).replacementValue = optionalDetail
        ? optionalDetail
        : undefined;
    }

    await this.applyResourceOperation(name, key, op);
  }

  /**
   * Update single resource property
   * This is similar to updateValue, but allows the operation to be fully specified
   * @param name Name of the resource to operate on.
   * @param key Property to change in resource JSON
   * @param operation The full operation object
   */
  public async applyResourceOperation<Type, T extends UpdateOperations>(
    name: string,
    key: string,
    operation: OperationFor<Type, T>,
  ) {
    const resource = Project.resourceObject(this.project, resourceName(name));
    await resource?.update(key, operation);
    this.project.collectLocalResources();
  }
}
