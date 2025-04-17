/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2025
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { DataType } from '../interfaces/resource-interfaces.js';
import { isBigInt } from '../utils/common-utils.js';
import * as EmailValidator from 'email-validator';

const SHORT_TEXT_MAX_LENGTH = 80;

/**
 * Checks if conversion 'from' 'to' can be done.
 * @param from Data type to convert from
 * @param to  Data type to convert to
 * @returns true if conversion can be done, false otherwise.
 */
export function allowed(from: DataType, to: DataType) {
  // Converting from strings is fine, except to enum.
  if (from === 'longText' || from === 'shortText') {
    switch (to) {
      case 'boolean':
      case 'date':
      case 'dateTime':
      case 'integer':
      case 'list':
      case 'longText':
      case 'number':
      case 'person':
      case 'shortText':
        return true;
      default:
        return false;
    }
  }
  // Converting from<->to number formats is fine
  if (
    (from === 'number' && to === 'integer') ||
    (from === 'integer' && to === 'number')
  ) {
    return true;
  }

  // Converting to strings is fine
  if (to === 'shortText' || to === 'longText') {
    return true;
  }

  // Converting from<->to date formats is fine
  if (
    (from === 'dateTime' && to === 'date') ||
    (from === 'date' && to === 'dateTime')
  ) {
    return true;
  }
  // Everything else is forbidden.
  return false;
}

/**
 * Converts number value to other data types.
 * @param value Value to convert
 * @param to Date type to which value is converted to
 * @returns converted value, or null if cannot convert
 * Allowed conversions are
 *  date -> dateTime
 *  dateTime -> date
 *  date/dateTime -> shortText/longText
 */
export function fromDate<T>(value: T, to: DataType) {
  if (to === 'date') {
    const tempDate = new Date(value as Date);
    return new Date(tempDate).toISOString().slice(0, 10);
  }
  if (to === 'dateTime') {
    const tempDate = new Date(value as Date);
    return new Date(tempDate).toISOString();
  }
  if (to === 'longText' || to === 'shortText') {
    return String(value);
  }
  return null;
}

/**
 * Converts number value to other data types.
 * @param value Value to convert
 * @param to Date type to which value is converted to
 * @returns converted value, or null if cannot convert
 * Allowed conversions are
 *  integer -> number
 *  number -> integer
 *  number/integer -> shortText
 *  number/integer -> longText
 */
export function fromNumber<T>(value: T, to: DataType) {
  if (to === 'integer') {
    return Math.trunc(value as number);
  }
  if (to === 'longText') {
    return String(value);
  }
  if (to === 'number') {
    return Number(value);
  }
  if (to === 'shortText') {
    const tempString = String(value);
    return tempString.length > SHORT_TEXT_MAX_LENGTH ? null : tempString;
  }
  return null;
}

/**
 * Converts string value to other data types.
 * @param value Value to convert
 * @param to Date type to which value is converted to
 * @returns converted value, or null if cannot convert
 * Allowed conversions are
 *  longText -> shortText
 *  shortText -> longText
 *  longText/shortText -> integer
 *  longText/shortText -> number
 *  longText/shortText -> list
 *  longText/shortText -> date/dateTime
 *  longText/shortText -> boolean
 */
export function fromString<T>(value: T, to: DataType) {
  switch (to) {
    case 'boolean': {
      if (value === 'true') return true;
      if (value === 'false') return false;
      return null;
    }
    case 'date': {
      try {
        const tempDate = new Date((value as string) + 'Z').toUTCString();
        return new Date(tempDate).toISOString().slice(0, 10);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (error) {
        return null;
      }
    }
    case 'dateTime': {
      try {
        const tempDate = new Date((value as string) + 'Z').toUTCString();
        return new Date(tempDate).toISOString();
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (error) {
        return null;
      }
    }
    case 'integer': {
      if (isBigInt(value as string)) {
        return BigInt(value as string);
      }
      const tempInt = parseInt(value as string);
      return isNaN(tempInt) ? null : tempInt;
    }
    case 'list': {
      return (value as string).split(',');
    }
    case 'longText': {
      return value;
    }
    case 'number': {
      if (isBigInt(value as string)) {
        return BigInt(value as string);
      }
      const tempNumber = parseFloat(value as string);
      return isNaN(tempNumber) ? null : tempNumber;
    }
    case 'person': {
      if (EmailValidator.validate(value as string)) {
        return String(value);
      }
      return null;
    }
    case 'shortText': {
      return (value as string).length > SHORT_TEXT_MAX_LENGTH ? null : value;
    }
  }
  return null;
}
