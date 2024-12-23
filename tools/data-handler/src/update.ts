/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { Create } from './create.js';
import {
  AddOperation,
  Operation,
  RankOperation,
  RemoveOperation,
  RenameOperation,
  UpdateOperations,
} from './resources/resource-object.js';
import { Project } from './containers/project.js';
import { resourceName } from './utils/resource-utils.js';

/**
 * Class that handles 'update' commands.
 */
export class Update {
  constructor(private project: Project) {}

  /**
   * Updates single resource property.
   * @param name Name of the resource
   * @param operation Operation to perform
   * @param key Property to change in resource JSON
   * @param value Value for 'key'
   * @param optionalDetail Additional detail needed for some operations
   */
  public async updateValue<Type>(
    name: string,
    operation: UpdateOperations,
    key: string,
    value: Type,
    optionalDetail?: Type,
  ) {
    const resource = Create.createResourceObject(
      this.project,
      resourceName(name),
    );
    const op: Operation<Type> = {
      name: operation,
      from: '' as Type,
      to: '' as Type,
      item: '' as Type,
      newIndex: 0 as number,
    };
    if (operation === 'add') {
      (op as unknown as AddOperation<Type>).item = value;
    } else if (operation === 'change') {
      (op as RenameOperation<Type>).from = optionalDetail
        ? value
        : (optionalDetail as Type);
      (op as RenameOperation<Type>).to = optionalDetail
        ? optionalDetail
        : (value as Type);
    } else if (operation === 'rank') {
      (op as unknown as RankOperation<Type>).newIndex =
        optionalDetail as number;
      (op as unknown as RankOperation<Type>).item = value;
    } else if (operation === 'remove') {
      (op as unknown as RemoveOperation<Type>).item = value;
    }
    await resource?.update(key, op);
    this.project.collectLocalResources();
  }
}
