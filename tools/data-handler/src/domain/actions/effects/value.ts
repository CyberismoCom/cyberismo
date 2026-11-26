// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

const TEXT_TYPES = new Set(['shortText', 'longText', 'person', 'enum']);
const INTEGER = /^-?[0-9]+$/;
const NUMBER = /^-?([0-9]+(\.[0-9]*)?|\.[0-9]+)([eE][-+]?[0-9]+)?$/;
const DATE = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/;
const DATE_TIME =
  /^([0-9]{4}-[0-9]{2}-[0-9]{2})T([0-9]{2}):([0-9]{2})(:[0-9]{2}(\.[0-9]+)?)?(Z|[+-][0-9]{2}:[0-9]{2})$/;

// Whether the text is a calendar date, YYYY-MM-DD.
function isDate(text: string): boolean {
  const match = DATE.exec(text);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  // setUTCFullYear, as Date.UTC takes the years 0 to 99 as 1900 to 1999.
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

// Whether the text is an ISO 8601 date-time with a time zone.
function isDateTime(text: string): boolean {
  const match = DATE_TIME.exec(text);
  return (
    !!match &&
    isDate(match[1]) &&
    Number(match[2]) < 24 &&
    Number(match[3]) < 60 &&
    !isNaN(Date.parse(text))
  );
}

/**
 * The value to write into a field of the data type for a text: null clears
 * the field, undefined means the text does not convert.
 */
export function coerce(
  dataType: string,
  text: string,
): string | number | boolean | null | undefined {
  if (text === '' && !TEXT_TYPES.has(dataType)) return null;
  switch (dataType) {
    case 'boolean':
      return text === 'true' || text === 'false' ? text === 'true' : undefined;
    case 'integer': {
      const number = INTEGER.test(text) ? Number(text) : NaN;
      return Number.isSafeInteger(number) ? number : undefined;
    }
    case 'number': {
      const number = NUMBER.test(text) ? Number(text) : NaN;
      return Number.isFinite(number) ? number : undefined;
    }
    case 'date':
      return isDate(text) ? text : undefined;
    case 'dateTime':
      // Stored in UTC, so one instant has one form.
      return isDateTime(text) ? new Date(text).toISOString() : undefined;
    default:
      return TEXT_TYPES.has(dataType) ? text : undefined;
  }
}
