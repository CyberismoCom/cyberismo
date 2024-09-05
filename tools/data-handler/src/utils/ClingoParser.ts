/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

interface Result {
  key: string;
  labels: string[];
  links: {
    key: string;
    linkType: string;
    displayName: string;
    linkDescription?: string;
  }[];
  policyChecks: {
    successes: { testSuite: string; testCase: string }[];
    failures: { testSuite: string; testCase: string; errorMessage: string }[];
  };
  deniedOperations: {
    transition: { transitionName: string; errorMessage: string }[];
    move: { errorMessage: string }[];
    delete: { errorMessage: string }[];
    editField: { fieldName: string; errorMessage: string }[];
    editContent: { errorMessage: string }[];
  };
  results: Result[]; // Nested results
  [key: string]: any;
}

export interface ParseResult {
  results: Result[];
  error: string | null;
}

class ClingoParser {
  private possibleKeywords = [
    'query_error',
    'result',
    'child_result',
    'field',
    'label',
    'link',
    'transition_denied',
    'moving_card_denied',
    'deleting_card_denied',
    'editing_field_denied',
    'editing_content_denied',
    'policy_check_failure',
    'policy_check_success',
    'order',
  ];

  private result: ParseResult = {
    results: [],
    error: null,
  };

  // The queue now stores the parameters instead of functions
  private resultQueue: { key: string }[] = [];
  private childResultQueue: { parentKey: string; childKey: string }[] = [];
  private tempResults: { [key: string]: Result } = {};
  private orderQueue: {
    level: number;
    fieldIndex: number;
    field: string;
    direction: 'ASC' | 'DESC';
  }[] = [];

  /**
   * Command handlers for each possible keyword
   * All of them will get parameters as strings
   * You can trust that clingo will always provide the correct number of parameters / types
   */
  private commandHandlers: { [command: string]: Function } = {
    query_error: (message: string, ...params: string[]) => {
      this.result.error = message;
    },
    result: (key: string) => {
      this.resultQueue.push({ key });
    },
    child_result: (parentKey: string, childKey: string) => {
      this.childResultQueue.push({ parentKey, childKey });
    },
    field: (key: string, fieldName: string, fieldValue: string) => {
      const res = this.getOrInitResult(key);
      res[fieldName] = fieldValue;
    },
    label: (key: string, label: string) => {
      const res = this.getOrInitResult(key);
      res.labels.push(label);
    },
    link: (
      key: string,
      cardKey: string,
      linkType: string,
      linkDescription?: string,
    ) => {
      const res = this.getOrInitResult(key);
      const displayName =
        res.key === key ? 'outboundDisplayName' : 'inboundDisplayName';
      res.links.push({ key: cardKey, linkType, displayName, linkDescription });
    },
    transition_denied: (
      key: string,
      transitionName: string,
      errorMessage: string,
    ) => {
      const res = this.getOrInitResult(key);
      res.deniedOperations.transition.push({ transitionName, errorMessage });
    },
    moving_card_denied: (key: string, errorMessage: string) => {
      const res = this.getOrInitResult(key);
      res.deniedOperations.move.push({ errorMessage });
    },
    deleting_card_denied: (key: string, errorMessage: string) => {
      const res = this.getOrInitResult(key);
      res.deniedOperations.delete.push({ errorMessage });
    },
    editing_field_denied: (
      key: string,
      fieldName: string,
      errorMessage: string,
    ) => {
      const res = this.getOrInitResult(key);
      res.deniedOperations.editField.push({ fieldName, errorMessage });
    },
    editing_content_denied: (key: string, errorMessage: string) => {
      const res = this.getOrInitResult(key);
      res.deniedOperations.editContent.push({ errorMessage });
    },
    policy_check_failure: (
      key: string,
      testSuite: string,
      testCase: string,
      errorMessage: string,
    ) => {
      const res = this.getOrInitResult(key);
      res.policyChecks.failures.push({ testSuite, testCase, errorMessage });
    },
    policy_check_success: (
      key: string,
      testSuite: string,
      testCase: string,
    ) => {
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

  private getOrInitResult(key: string): Result {
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
  private sortByLevel(results: Result[], level: number) {
    // Get all the orders for the current hierarchy level
    const levelOrders = this.orderQueue
      .filter((order) => order.level === level)
      .sort((a, b) => a.fieldIndex - b.fieldIndex); // Sort by field index (primary, secondary, etc.)

    // Apply the sorting based on all fields in the correct order
    if (levelOrders.length > 0) {
      results.sort((a, b) => {
        for (const { field, direction } of levelOrders) {
          const sortOrder = direction === 'ASC' ? 1 : -1;
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
      this.result.results.push(res);
    });

    this.childResultQueue.forEach(({ parentKey, childKey }) => {
      const parent = this.getOrInitResult(parentKey);
      const child = this.getOrInitResult(childKey);
      parent.results.push(child);
    });

    // Apply sorting for each level in the orderQueue
    const maxLevel = Math.max(...this.orderQueue.map((o) => o.level), 1);
    for (let level = 1; level <= maxLevel; level++) {
      this.sortByLevel(this.result.results, level);
    }
  }

  public parseInput(input: string): ParseResult {
    const regex = new RegExp(
      `(${this.possibleKeywords.join('|')})\\(([^)]*)\\)`,
    );
    const lines = input.split('\n');

    for (const line of lines) {
      const match = line.match(regex);
      if (match && match.length === 3) {
        const command = match[1];
        const args = match[2].split(',').map((x) => x.trim());

        // Sanitize the arguments to remove extra quotes
        const sanitizedArgs = args.map((arg) => arg.replace(/^"(.*)"$/, '$1'));

        // Apply the command handler with sanitized arguments
        this.commandHandlers[command](...sanitizedArgs);
      }
    }

    this.applyResultProcessing();
    return this.result;
  }
}

export default ClingoParser;
