/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import type { ValidationError } from 'json-schema';

export class DHValidationError extends Error {
  public errors?: ValidationError[];
  constructor(message: string, errors?: ValidationError[]) {
    super(message);
    this.name = 'DHValidationError';
    this.errors = errors;
  }
}

export class SchemaNotFound extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SchemaNotFound';
  }
}
