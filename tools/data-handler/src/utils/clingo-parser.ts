/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { DataType } from '../interfaces/resource-interfaces.js';
import { BaseResult, ParseResult } from '../types/queries.js';

/**
 * This function reverses the encoding made by the "encodeClingoValue" function
 */
export function decodeClingoValue(value: string) {
  return value.replace(/\\([n\\"])/g, (_, char) => {
    if (char === 'n') {
      return '\n';
    }
    return char;
  });
}

class ClingoParser {
  private keywords = [
    'queryError',
    'result',
    'childResult',
    'field',
    'enumField',
    'listField',
    'label',
    'link',
    'transitionDenied',
    'movingCardDenied',
    'deletingCardDenied',
    'editingFieldDenied',
    'editingContentDenied',
    'notification',
    'policyCheckFailure',
    'policyCheckSuccess',
    'order',
  ];

  private result: ParseResult<BaseResult> = {
    results: [],
    error: null,
  };

  // The queue now stores the parameters instead of functions
  private resultQueue: { key: string }[] = [];
  private childResultQueue: {
    parentKey: string;
    childKey: string;
    collection: string;
  }[] = [];
  private tempResults: { [key: string]: BaseResult } = {};
  private orderQueue: {
    level: number;
    collection: string;
    fieldIndex: number;
    field: string;
    direction: 'ASC' | 'DESC';
  }[] = [];
  private collections: Set<string> = new Set();
  private reset() {
    this.result = {
      results: [],
      error: null,
    };
    this.resultQueue = [];
    this.childResultQueue = [];
    this.tempResults = {};
    this.orderQueue = [];
    this.collections = new Set();
  }

  /**
   * Command handlers for each possible keyword
   * All of them will get parameters as strings
   * You can trust that clingo will always provide the correct number of parameters / types
   */
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  private commandHandlers: Record<string, Function> = {
    queryError: (message: string, ...params: string[]) => {
      this.result.error = `${message}${params.length > 1 ? ` ${params.join(', ')}` : ''}`;
    },
    result: (key: string) => {
      this.resultQueue.push({ key });
    },
    childResult: (parentKey: string, childKey: string, collection: string) => {
      this.childResultQueue.push({ parentKey, childKey, collection });
      this.collections.add(collection);
    },
    enumField: async (key: string, fieldName: string, fieldValue: string) => {
      const res = this.getOrInitResult(key);
      const decoded = decodeClingoValue(fieldValue);
      res[fieldName] = decoded;
    },
    field: async (
      key: string,
      fieldName: string,
      fieldValue: string,
      dataType: DataType,
    ) => {
      const res = this.getOrInitResult(key);
      const decoded = decodeClingoValue(fieldValue);
      switch (dataType) {
        case 'shortText':
        case 'longText':
        case 'person':
        case 'date':
        case 'dateTime':
        case 'enum':
          res[fieldName] = decoded;
          break;
        case 'number':
          res[fieldName] = parseFloat(decoded);
          break;
        case 'integer':
          res[fieldName] = parseInt(decoded, 10);
          break;
        case 'boolean':
          res[fieldName] = fieldValue === 'true';
          break;
        case 'list':
          res[fieldName] = decoded.split(',');
          break;
      }
    },
    label: (key: string, label: string) => {
      const res = this.getOrInitResult(key);
      res.labels.push(label);
    },
    link: (
      key: string, // key is the card itself
      cardKey: string, // cardKey is otherCard this is being linked to
      title: string,
      linkType: string,
      displayName: string,
      direction: 'inbound' | 'outbound',
      linkDescription?: string,
    ) => {
      const res = this.getOrInitResult(key);
      res.links.push({
        key: cardKey,
        linkType,
        displayName,
        linkDescription,
        direction,
        title,
      });
    },
    transitionDenied: (
      key: string,
      transitionName: string,
      errorMessage: string,
    ) => {
      const res = this.getOrInitResult(key);
      res.deniedOperations.transition.push({ transitionName, errorMessage });
    },
    movingCardDenied: (key: string, errorMessage: string) => {
      const res = this.getOrInitResult(key);
      res.deniedOperations.move.push({ errorMessage });
    },
    deletingCardDenied: (key: string, errorMessage: string) => {
      const res = this.getOrInitResult(key);
      res.deniedOperations.delete.push({ errorMessage });
    },
    editingFieldDenied: (
      key: string,
      fieldName: string,
      errorMessage: string,
    ) => {
      const res = this.getOrInitResult(key);
      res.deniedOperations.editField.push({ fieldName, errorMessage });
    },
    editingContentDenied: (key: string, errorMessage: string) => {
      const res = this.getOrInitResult(key);
      res.deniedOperations.editContent.push({ errorMessage });
    },
    notification: (
      key: string,
      category: string,
      title: string,
      message: string,
    ) => {
      const res = this.getOrInitResult(key);
      res.notifications.push({ key, category, title, message });
    },
    policyCheckFailure: (
      key: string,
      category: string,
      title: string,
      errorMessage: string,
    ) => {
      const res = this.getOrInitResult(key);
      res.policyChecks.failures.push({ category, title, errorMessage });
    },
    policyCheckSuccess: (key: string, category: string, title: string) => {
      const res = this.getOrInitResult(key);
      res.policyChecks.successes.push({ category, title });
    },
    order: (
      level: string,
      collection: string,
      fieldIndex: string,
      field: string,
      direction: 'ASC' | 'DESC',
    ) => {
      const parsedLevel = parseInt(level, 10);
      const parsedFieldIndex = parseInt(fieldIndex, 10);
      this.orderQueue.push({
        level: parsedLevel,
        collection,
        fieldIndex: parsedFieldIndex,
        field,
        direction,
      });
    },
  };

  private getOrInitResult(key: string): BaseResult {
    if (!this.tempResults[key]) {
      this.tempResults[key] = {
        key,
        labels: [],
        links: [],
        notifications: [],
        policyChecks: { successes: [], failures: [] },
        deniedOperations: {
          transition: [],
          move: [],
          delete: [],
          editField: [],
          editContent: [],
        },
      };
    }
    return this.tempResults[key];
  }
  private sortByLevel(
    results: BaseResult[],
    level: number = 1,
    currentCollection?: string,
  ) {
    const levelOrders = this.orderQueue
      .filter(
        (order) =>
          order.level === level &&
          (currentCollection ? order.collection === currentCollection : true), // if no collection specified at top-level, take all
      )
      .sort((a, b) => a.fieldIndex - b.fieldIndex);

    // Apply sorting instructions for this level/collection if any
    if (levelOrders.length > 0) {
      results.sort((a, b) => {
        for (const { field, direction } of levelOrders) {
          const sortOrder = direction === 'ASC' ? -1 : 1;

          if (a[field] == null && b[field] == null) {
            continue; // both are null, move on to next field
          } else if (a[field] == null) {
            return sortOrder; // 'a' is considered less
          } else if (b[field] == null) {
            return -sortOrder; // 'b' is considered less
          }

          // Regular comparison
          if (a[field] < b[field]) return sortOrder;
          if (a[field] > b[field]) return -sortOrder;
          // if equal, try next field
        }
        // if all fields equal
        return 0;
      });
    }

    // Recursively sort all known child collections
    for (const result of results) {
      for (const childCollection of this.collections) {
        const childResults = result[childCollection];
        if (Array.isArray(childResults)) {
          this.sortByLevel(childResults, level + 1, childCollection);
        }
      }
    }
  }
  private applyResultProcessing() {
    // Process results and parent-child relationships
    this.resultQueue.forEach(({ key }) => {
      const res = this.getOrInitResult(key);
      this.result.results.push(res); // Here we assume the query is correct and returns the data specified by the query
    });

    this.childResultQueue.forEach(({ parentKey, childKey, collection }) => {
      const parent = this.getOrInitResult(parentKey);
      const child = this.getOrInitResult(childKey);

      if (!parent[collection] || !Array.isArray(parent[collection])) {
        parent[collection] = [];
      }

      (parent[collection] as unknown[]).push(child);
    });

    this.sortByLevel(this.result.results);
  }

  /**
   * This methods is responsible for converting clingo output to a parsed object
   * @param input clingo input to parse
   * @returns
   */
  public async parseInput(input: string): Promise<ParseResult<BaseResult>> {
    let position = 0;

    while (position < input.length) {
      const keywordMatch = this.findKeyword(input, position);

      if (!keywordMatch) {
        break;
      }

      const { keyword, endIndex } = keywordMatch;
      position = endIndex;

      const parsed = this.parseArguments(input, position);
      if (parsed) {
        // Apply the command handler with sanitized arguments
        await this.commandHandlers[keyword](...parsed.args);
        position = parsed.endPosition; // move position after the argument closing parenthesis
      }
    }

    this.applyResultProcessing();
    const result = this.result;

    // Reset the parser state
    this.reset();

    return result;
  }

  /**
   * This method finds the next keyword in a string after a specified point
   * @param input The string which it being searched
   * @param start The position from which to start the search from
   * @returns
   */
  private findKeyword(
    input: string,
    start: number,
  ): { keyword: string; startIndex: number; endIndex: number } | null {
    // Create a regex dynamically from the keywords list
    const regex = new RegExp(`(${this.keywords.join('|')})\\(`, 'g');

    // Apply the regex starting from the current position
    regex.lastIndex = start;
    const match = regex.exec(input);

    if (match) {
      return {
        keyword: match[1], // The matched keyword (first capture group)
        startIndex: match.index, // Position of the matched keyword
        endIndex: match.index + match[0].length, // Position after the keyword and opening parenthesis
      };
    }

    return null;
  }

  /**
   * This method is a custom parser, which takes in the whole clingo output and parses the arguments.
   * Note: Do not decode in this function. It will be handled on a higher level.
   * As long as this function returns valid clingo, it has done it's responsibility
   * @param input Clingo output
   * @param position Position of the command being parsed inside the string
   * @returns
   */
  private parseArguments(
    input: string,
    position: number,
  ): { args: string[]; endPosition: number } | null {
    let currentArg = '';
    const args: string[] = [];
    let insideQuote = false;

    // calculates how deep into parenthesis we are
    let insideParanthesis = 0;

    for (let i = position; i < input.length; i++) {
      const char = input[i];

      if (char === '"') {
        if (i !== 0 && input[i - 1] === '\\') {
          currentArg += '"';
          continue;
        }
        if (!insideQuote && insideParanthesis === 0) {
          // We can ignore the chars, which are before a quoted string
          currentArg = '';
        }
        insideQuote = !insideQuote; // Toggle inside/outside quotes
        continue;
      }

      if (char === ',' && !insideQuote) {
        if (insideParanthesis > 0) {
          currentArg += char;
          continue;
        }
        args.push(currentArg);
        currentArg = '';
        insideParanthesis = 0;
        continue;
      }
      if (char === '(' && !insideQuote) {
        if (insideParanthesis === 0) {
          currentArg = '';
        }
        insideParanthesis++;
      }

      if (char === ')' && !insideQuote) {
        if (insideParanthesis-- !== 0) {
          currentArg += char;
          continue;
        }
        args.push(currentArg);
        return {
          args,
          endPosition: i + 1,
        };
      }

      currentArg += char;
    }

    return null; // No valid arguments found
  }
}

export default ClingoParser;
