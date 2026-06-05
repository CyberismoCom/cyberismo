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
import type { Project } from '../containers/project.js';
import type { UpdateKey } from '../interfaces/resource-interfaces.js';
import { runWithDefaultCommitMessage } from '../utils/commit-context.js';
import { ResourceMutations } from '../mutations/resource-mutations.js';
import { resourceName as parseResourceName } from '../utils/resource-utils.js';

/**
 * Class that handles 'update' commands.
 */
export class Update {
  private readonly mutations: ResourceMutations;

  /**
   * Creates an instance of Update command.
   * @param project Project to use.
   */
  constructor(private project: Project) {
    this.mutations = new ResourceMutations(project);
  }

  /**
   * Update single resource property
   * This is similar to updateValue, but allows the operation to be fully specified
   * @param name Name of the resource to operate on.
   * @param updateKey Property to change in resource or in resource content.
   * @param operation The full operation object
   * @template Type Type of the target of the operation
   * @template T Type of operation ('add', 'remove', 'change', 'rank')
   * @template K Type of the key to change
   */
  public async applyResourceOperation<
    Type,
    T extends UpdateOperations,
    K extends string,
  >(name: string, updateKey: UpdateKey<K>, operation: OperationFor<Type, T>) {
    const type = this.project.resources.extractType(name);

    // A rename is encoded as a 'change' on the 'name' updateKey.
    const isRename = updateKey.key === 'name' && operation.name === 'change';

    // Only resource families with a dedicated handler are routed through the
    // engine; the rest apply their cascade in-class. (Do not generalise this
    // to a blanket Set of types — the dispatcher would route unhandled
    // (type, key, operation) tuples to DefaultNoCascadeHandler and silently
    // drop their cascade.)
    const target = parseResourceName(name);

    // linkTypes + fieldTypes route every edit through the engine: dataType /
    // enumValues ops have dedicated handlers, and the remaining shapes (e.g.
    // displayName) fall through to DefaultNoCascadeHandler, which calls
    // resource.update() with no cascade and no log entry.
    if (type === 'linkTypes' || type === 'fieldTypes') {
      if (isRename) {
        const newIdentifier = parseResourceName(
          (operation as ChangeOperation<string>).to,
        ).identifier;
        const input = { kind: 'rename' as const, target, newIdentifier };
        await this.mutations.apply(input);
        return;
      }

      const input = {
        kind: 'edit' as const,
        target,
        updateKey,
        operation,
      };
      await this.mutations.apply(input);
      return;
    }

    if (type === 'cardTypes') {
      if (isRename) {
        const newIdentifier = parseResourceName(
          (operation as ChangeOperation<string>).to,
        ).identifier;
        const input = { kind: 'rename' as const, target, newIdentifier };
        await this.mutations.apply(input);
        return;
      }

      // Only the cardType edits with a dedicated handler are routed; all other
      // cardType edits (e.g. rank, alwaysVisibleFields, displayName) use the
      // in-class cascade path.
      const routedEdit =
        (updateKey.key === 'workflow' && operation.name === 'change') ||
        (updateKey.key === 'customFields' &&
          (operation.name === 'add' || operation.name === 'remove'));

      if (routedEdit) {
        const input = {
          kind: 'edit' as const,
          target,
          updateKey,
          operation,
        };
        await this.mutations.apply(input);
        return;
      }
    }

    if (type === 'workflows') {
      if (isRename) {
        const newIdentifier = parseResourceName(
          (operation as ChangeOperation<string>).to,
        ).identifier;
        const input = { kind: 'rename' as const, target, newIdentifier };
        await this.mutations.apply(input);
        return;
      }

      // ALL workflow edits route through the engine. The dispatched handlers
      // (add/remove/rename state, transition) delegate the cascade to
      // WorkflowResource.update while recording a log entry for the breaking
      // ones. Edit shapes without a dedicated handler (e.g. displayName change)
      // fall to DefaultNoCascadeHandler, which runs the same `resource.update`
      // with no log entry.
      const input = {
        kind: 'edit' as const,
        target,
        updateKey,
        operation,
      };
      await this.mutations.apply(input);
      return;
    }

    // Renames for these leaf resource families are routed through the engine;
    // their other edits fall through to the legacy path below.
    if (
      isRename &&
      (type === 'calculations' ||
        type === 'reports' ||
        type === 'graphModels' ||
        type === 'graphViews' ||
        type === 'templates')
    ) {
      const newIdentifier = parseResourceName(
        (operation as ChangeOperation<string>).to,
      ).identifier;
      const input = { kind: 'rename' as const, target, newIdentifier };
      await this.mutations.apply(input);
      return;
    }

    const run = () =>
      this.project.lock.write(async () => {
        const resource = this.project.resources.byType(name, type);
        await resource?.update(updateKey, operation);
      });
    return runWithDefaultCommitMessage('Apply resource operation', run);
  }

  /**
   * Updates single resource property.
   * @param name Name of the resource to operate on.
   * @param operation Operation to perform ('add', 'remove', 'change', 'rank')
   * @param key Property to change in resource JSON. If content, content/<property>
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
    // Safe to not have lock here, this is just a wrapper to applyResourceOperation
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
    const splitKey = key.split('/');
    if (splitKey.length !== 1 && splitKey.length !== 2) {
      throw new Error(
        `Invalid key format: ${key}. Use 'property' or 'content/<property>'.`,
      );
    }

    if (splitKey.length === 2 && splitKey[0] !== 'content') {
      throw new Error(
        `Invalid key format: ${key}. When using 'content', always use as 'content/<property>'.`,
      );
    }
    const [parsedKey, subKey] = splitKey;
    if (parsedKey === 'content') {
      await this.applyResourceOperation(name, { key: parsedKey, subKey }, op);
    } else {
      await this.applyResourceOperation(name, { key: parsedKey }, op);
    }
  }
}
