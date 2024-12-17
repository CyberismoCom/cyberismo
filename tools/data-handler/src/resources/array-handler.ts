/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import {
  AddOperation,
  Operation,
  RankOperation,
  RemoveOperation,
  RenameOperation,
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
    const itemStr = JSON.stringify(item);
    return array.findIndex((element) => JSON.stringify(element) === itemStr);
  }

  private handleAdd(
    operation: AddOperation<T>,
    array: T[],
    arrayName: string,
  ): T[] {
    const parsedItem = this.tryParseJSON(operation.item);
    const index = this.findItemIndex(parsedItem, array);

    if (index !== -1) {
      throw new Error(
        `Item '${JSON.stringify(parsedItem)}' already exists in '${arrayName}'`,
      );
    }

    return [...array, parsedItem];
  }

  private handleChange(operation: RenameOperation<T>, array: T[]): T[] {
    const { from, to } = operation;
    const parsedTo = this.tryParseJSON(to);

    if (typeof to === 'string' && (to.startsWith('[') || to.startsWith('{'))) {
      return parsedTo as T[];
    }

    return array.map((item) => (item === from ? parsedTo : item));
  }

  private handleRank(
    operation: RankOperation<T>,
    array: T[],
    arrayName: string,
  ): T[] {
    const { item, newIndex } = operation;
    const fromIndex = this.findItemIndex(item, array);

    if (fromIndex === -1) {
      throw new Error(
        `Item '${JSON.stringify(item)}' not found in '${arrayName}'`,
      );
    }

    if (!this.isValidIndex(newIndex, array)) {
      throw new Error(`Invalid target index: ${newIndex}`);
    }

    const result = [...array];
    const [removed] = result.splice(fromIndex, 1);
    result.splice(newIndex, 0, removed);
    return result;
  }

  private handleRemove(
    operation: RemoveOperation<T>,
    array: T[],
    arrayName: string,
  ): T[] {
    const index = this.findItemIndex(operation.item, array);

    if (index === -1) {
      throw new Error(
        `Item '${JSON.stringify(operation.item)}' not found in '${arrayName}'`,
      );
    }

    return array.filter((_, i) => i !== index);
  }

  public handleArray(
    operation: Operation<T>,
    arrayName: string,
    array: T[],
  ): T[] {
    const handlers = {
      add: (op: AddOperation<T>) => this.handleAdd(op, array, arrayName),
      change: (op: RenameOperation<T>) => this.handleChange(op, array),
      rank: (op: RankOperation<T>) => this.handleRank(op, array, arrayName),
      remove: (op: RemoveOperation<T>) =>
        this.handleRemove(op, array, arrayName),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return handlers[operation.name](operation as any);
  }
}
