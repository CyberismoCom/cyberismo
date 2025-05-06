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

import { Project } from '../containers/project.js';
import { resourceName } from '../utils/resource-utils.js';

import type {
  AddOperation,
  ChangeOperation,
  Operation,
  RankOperation,
  RemoveOperation,
  UpdateOperations,
} from '../resources/resource-object.js';

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
   */
  public async updateValue<Type>(
    name: string,
    operation: UpdateOperations,
    key: string,
    value: Type,
    optionalDetail?: Type, // todo: for 'rank' it might be reasonable to accept also 'number'
  ) {
    const resource = Project.resourceObject(this.project, resourceName(name));
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
    } else if (operation === 'rank') {
      (op as RankOperation<Type>).newIndex = optionalDetail as number;
      (op as RankOperation<Type>).target = value;
    } else if (operation === 'remove') {
      (op as RemoveOperation<Type>).target = value;
      (op as RemoveOperation<Type>).replacementValue = optionalDetail
        ? optionalDetail
        : undefined;
    }

    await resource?.update(key, op);
    this.project.collectLocalResources();
  }
}
