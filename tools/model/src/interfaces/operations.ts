/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2026

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

// Possible operations to perform when doing "update"
export type UpdateOperations = 'add' | 'change' | 'rank' | 'remove';

// Base class for update operations.
type BaseOperation<T> = {
  name: 'add' | 'change' | 'rank' | 'remove';
  target: T;
};

// Add item to an array.
export type AddOperation<T> = BaseOperation<T> & {
  name: 'add';
};

// Change item in an array or property in an object or rename a scalar.
// 'target' is the item to change and is required for array changes; scalar
// changes carry no old value, so it may be omitted.
export type ChangeOperation<T> = Omit<BaseOperation<T>, 'target'> & {
  name: 'change';
  target?: T;
  to: T;
  mappingTable?: { stateMapping: Record<string, string> }; // Optional state mapping for workflow changes
};

// Move item in an array to new position.
export type RankOperation<T> = BaseOperation<T> & {
  name: 'rank';
  newIndex: number;
};

// Remove item from an array.
export type RemoveOperation<T> = BaseOperation<T> & {
  name: 'remove';
  replacementValue?: T;
};

export type Operation<T> =
  AddOperation<T> | ChangeOperation<T> | RankOperation<T> | RemoveOperation<T>;

// Utility mapping from operation name to its concrete operation type
export type OperationMap<T> = {
  add: AddOperation<T>;
  change: ChangeOperation<T>;
  rank: RankOperation<T>;
  remove: RemoveOperation<T>;
};

// Given an operation name, get the corresponding operation type
export type OperationFor<T, N extends UpdateOperations> = OperationMap<T>[N];
