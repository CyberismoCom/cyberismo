/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { deepCompare } from '../utils/common-utils.js';

import type {
  AddOperation,
  ChangeOperation,
  Operation,
  RankOperation,
  RemoveOperation,
} from './resource-object.js';

export class ArrayHandler<T> {
  private isValidIndex(index: number, array: T[]): boolean {
    return index >= 0 && index < array.length;
  }

  private tryParseJSON<U>(value: U): U {
    if (typeof value !== 'string') return value;
    try {
      const trimmed = value.trim();
      if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
        return JSON.parse(trimmed) as U;
      }
    } catch {
      // Ignore parse errors
    }
    return value;
  }

  private findItemIndex(item: T, array: T[]): number {
    if (!array) return -1;
    let index = array.findIndex((element) => {
      return deepCompare(element as object, item as object);
    });

    // Special case 1: change was provided with object that has 'name' only (not full object)
    if (index === -1) {
      index = array.findIndex((element) => {
        const nameOnlyElement = { name: element['name' as keyof T] };
        if (nameOnlyElement.name === undefined) return false;
        return deepCompare(nameOnlyElement as object, item as object);
      });
    }

    // Special case 2: change was provided with string (name) only. Try to find with string as 'name'.
    if (index === -1) {
      for (const element of array) {
        if (element['name' as keyof T] === item) {
          index = array.indexOf(element);
          break;
        }
      }
    }
    return index;
  }

  private handleAdd(operation: AddOperation<T>, array: T[]): T[] {
    const parsedItem = this.tryParseJSON(operation.target);
    const index = this.findItemIndex(parsedItem, array);

    if (index !== -1) {
      throw new Error(`Item '${JSON.stringify(parsedItem)}' already exists`);
    }

    return [...array, parsedItem];
  }

  private handleChange(operation: ChangeOperation<T>, array: T[]): T[] {
    const { target, to } = operation;
    const parsedTarget = this.tryParseJSON(operation.target);
    const targetIndex = this.findItemIndex(parsedTarget, array);
    if (targetIndex === -1) {
      throw new Error(`Item '${JSON.stringify(target)}' not found`);
    }
    const actualTarget = array[targetIndex];
    const parsedTo = this.tryParseJSON(to);

    if (typeof to === 'string' && (to.startsWith('[') || to.startsWith('{'))) {
      return parsedTo as T[];
    }

    const updatedArray = array.map((item) =>
      deepCompare(item as object, actualTarget as object) ? parsedTo : item,
    );
    if (deepCompare(updatedArray, array)) {
      throw new Error('Cannot change value. Target was not found.');
    }
    return updatedArray;
  }

  private handleRank(operation: RankOperation<T>, array: T[]): T[] {
    const { target, newIndex } = operation;
    const fromIndex = this.findItemIndex(target, array);
    if (fromIndex === -1) {
      throw new Error(`Item '${JSON.stringify(target)}' not found`);
    }

    if (!this.isValidIndex(newIndex, array)) {
      throw new Error(`Invalid target index: ${newIndex}`);
    }

    const result = [...array];
    const [removed] = result.splice(fromIndex, 1);
    result.splice(newIndex, 0, removed);
    return result;
  }

  private handleRemove(operation: RemoveOperation<T>, array: T[]): T[] {
    const index = this.findItemIndex(operation.target, array);

    if (index === -1) {
      throw new Error(`Item '${JSON.stringify(operation.target)}' not found`);
    }

    return array.filter((_, i) => i !== index);
  }

  /**
   * Handles operation to an array.
   * @param operation Operation to perform on array.
   * @param array Array to operate on.
   * @returns Changed array after the operation.
   */
  public handleArray(operation: Operation<T>, array: T[]): T[] {
    const handlers = {
      add: (op: AddOperation<T>) => this.handleAdd(op, array),
      change: (op: ChangeOperation<T>) => this.handleChange(op, array),
      rank: (op: RankOperation<T>) => this.handleRank(op, array),
      remove: (op: RemoveOperation<T>) => this.handleRemove(op, array),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return handlers[operation.name](operation as any);
  }
}
