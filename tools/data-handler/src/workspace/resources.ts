/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026

  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import type { CreateParamsByType } from '@cyberismo/model';
import type { Checkout } from '../containers/project.js';
import { createSubject } from '../mutations/resource-mutations.js';
import { runWithDefaultCommitMessage } from '../utils/commit-context.js';
import { resourceName } from '../utils/resource-utils.js';
import type { Changes } from './changes.js';

/**
 * Resources of one handle. Writes go through the handle's changes. Holds no
 * state of its own.
 */
export class Resources {
  constructor(
    private readonly checkout: Checkout,
    private readonly changes: Changes,
  ) {}

  /**
   * Creates a resource of `type`; `name` is its identifier or its full
   * resource name. Sugar for a 'create' change.
   * @throws if `name` names a resource of another type.
   */
  public async create<T extends keyof CreateParamsByType>(
    name: string,
    type: T,
    params: CreateParamsByType[T],
  ): Promise<void> {
    const target = resourceName(
      name && name.split('/').length === 1
        ? `${this.checkout.projectPrefix}/${type}/${name}`
        : name,
    );
    if (target.type !== type) {
      throw new Error(`Resource '${name}' is not of type '${type}'`);
    }
    await runWithDefaultCommitMessage(createSubject(type, name), () =>
      this.changes.apply({ kind: 'create', target, params }),
    );
  }
}
