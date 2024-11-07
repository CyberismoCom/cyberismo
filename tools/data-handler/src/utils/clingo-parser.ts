/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { Project } from '../containers/project.js';
import { BaseResult, ParseResult } from '../types/queries.js';

/**
 * This function takes care of encoding chars, which might produce issues in clingo
 * This should be done for user provided values
 */
export function encodeClingoValue(value: string) {
  return value.replace(/[\n\\"]/g, (char) => {
    if (char === '\n') {
      return '\\n';
    }
    return `\\${char}`;
  });
}

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
    'label',
    'link',
    'transitionDenied',
    'movingCardDenied',
    'deletingCardDenied',
    'editingFieldDenied',
    'editingContentDenied',
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
  private childResultQueue: { parentKey: string; childKey: string }[] = [];
  private tempResults: { [key: string]: BaseResult } = {};
  private orderQueue: {
    level: number;
    fieldIndex: number;
    field: string;
    direction: 'ASC' | 'DESC';
  }[] = [];

  // For now we depend on the project to get link display names
  private project: Project;

  constructor(project: Project) {
    this.project = project;
  }

  private reset() {
    this.result = {
      results: [],
      error: null,
    };
    this.resultQueue = [];
    this.childResultQueue = [];
    this.tempResults = {};
    this.orderQueue = [];
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
    childResult: (parentKey: string, childKey: string) => {
      this.childResultQueue.push({ parentKey, childKey });
    },
    field: (key: string, fieldName: string, fieldValue: string) => {
      const res = this.getOrInitResult(key);
      res[fieldName] = decodeClingoValue(fieldValue);
    },
    label: (key: string, label: string) => {
      const res = this.getOrInitResult(key);
      res.labels.push(label);
    },
    link: async (
      key: string,
      cardKey: string,
      linkType: string,
      linkDescription?: string,
    ) => {
      const res = this.getOrInitResult(key);

      const linkTypeObj = await this.project.linkType(linkType);
      if (!linkTypeObj) {
        throw new Error(`Link type '${linkType}' not found`);
      }
      const displayName = linkTypeObj.outboundDisplayName;
      res.links.push({
        key: cardKey,
        linkType,
        displayName,
        linkDescription,
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
    policyCheckFailure: (
      key: string,
      testSuite: string,
      testCase: string,
      errorMessage: string,
    ) => {
      const res = this.getOrInitResult(key);
      res.policyChecks.failures.push({ testSuite, testCase, errorMessage });
    },
    policyCheckSuccess: (key: string, testSuite: string, testCase: string) => {
      const res = this.getOrInitResult(key);
      res.policyChecks.successes.push({ testSuite, testCase });
    },
    order: (
      level: string,
      fieldIndex: string,
      field: string,
      direction: 'ASC' | 'DESC',
    ) => {
      const parsedLevel = parseInt(level, 10);
      const parsedFieldIndex = parseInt(fieldIndex, 10);
      this.orderQueue.push({
        level: parsedLevel,
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
        results: [],
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
  private sortByLevel(results: BaseResult[], level: number = 1) {
    // Get all the orders for the current hierarchy level
    const levelOrders = this.orderQueue
      .filter((order) => order.level === level)
      .sort((a, b) => a.fieldIndex - b.fieldIndex); // Sort by field index (primary, secondary, etc.)

    // Apply the sorting based on all fields in the correct order
    if (levelOrders.length > 0) {
      results.sort((a, b) => {
        for (const { field, direction } of levelOrders) {
          const sortOrder = direction === 'ASC' ? -1 : 1;

          if (!a[field]) return sortOrder;
          if (!b[field]) return -sortOrder;
          const comparison = a[field] < b[field] ? sortOrder : -sortOrder;
          if (comparison !== 0) return comparison; // If not equal, stop and return result
        }
        return 0; // If all fields are equal, leave order unchanged
      });
    }

    // Recursively sort child results (if any) by reducing the hierarchy level
    results.forEach((result) => {
      if (result.results) {
        this.sortByLevel(result.results, level + 1); // Move to the next level
      }
    });
  }
  private applyResultProcessing() {
    // Process results and parent-child relationships
    this.resultQueue.forEach(({ key }) => {
      const res = this.getOrInitResult(key);
      this.result.results.push(res); // Here we assume the query is correct and returns the data specified by the query
    });

    this.childResultQueue.forEach(({ parentKey, childKey }) => {
      const parent = this.getOrInitResult(parentKey);
      const child = this.getOrInitResult(childKey);
      parent.results.push(child);
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
