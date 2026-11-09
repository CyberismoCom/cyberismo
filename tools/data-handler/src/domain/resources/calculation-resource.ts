// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { join } from 'node:path';

import { CONTENT_FILES, type ResourceName } from '@cyberismo/model';
import { DefaultContent } from './create-defaults.js';
import { FolderResource } from './folder-resource.js';
import { resourceNameToString } from '../../shared/utils/resource-utils.js';
import { sortCards } from '../../shared/utils/card-utils.js';
import { writeFileSafe } from '../../shared/utils/file-utils.js';
import { DHValidationError } from '../../shared/exceptions/index.js';

import type {
  CalculationContent,
  CalculationMetadata,
  Card,
} from '@cyberismo/model';
import type { Checkout } from '../../state/checkout/checkout.js';
import type { Diagnostic } from '../../infra/logic/logic-backend.js';

/**
 * Calculation resource class.
 */
export class CalculationResource extends FolderResource<
  CalculationMetadata,
  CalculationContent
> {
  /**
   * Creates instance of CalculationResource
   * @param checkout Project to use
   * @param name Resource name
   * @internal
   */
  constructor(checkout: Checkout, name: ResourceName) {
    super(checkout, name, 'calculations');

    this.contentSchemaId = 'calculationSchema';
    this.contentSchema = super.contentSchemaContent(this.contentSchemaId);
  }

  /**
   * Creates a new calculation object and file.
   * @param newContent Content for the calculation.
   */
  public async create(newContent?: CalculationMetadata) {
    if (!newContent) {
      newContent = DefaultContent.calculation(
        resourceNameToString(this.resourceName),
      );
    } else {
      await this.validate(newContent);
    }
    await super.create(newContent);

    const calculationContent = `% add your calculations here for '${this.resourceName.identifier}'`;
    const calculationFile = CONTENT_FILES.calculation;
    const calculationsFile = join(this.internalFolder, calculationFile);
    await writeFileSafe(calculationsFile, calculationContent, {
      flag: 'wx',
    });

    await this.loadContentFiles();
  }

  /**
   * Checks a calculation logic program on its own with the logic backend:
   * syntax and safety errors (e.g. unsafe variables).
   * @param content Logic program to check; defaults to this resource's
   *                current calculation content.
   * @returns whether it is valid, the backend's error messages, and its
   *          diagnostics.
   */
  public async validateLogicProgram(content?: string): Promise<{
    valid: boolean;
    errors: string[];
    diagnostics: Diagnostic[];
  }> {
    const diagnostics = await this.checkout.calculationEngine.check([
      {
        key: resourceNameToString(this.resourceName),
        role: 'knowledge',
        text: content ?? this.contentData().calculation ?? '',
      },
    ]);
    const errors = diagnostics
      .filter((diagnostic) => diagnostic.severity === 'error')
      .map((diagnostic) => diagnostic.message);
    return { valid: errors.length === 0, errors, diagnostics };
  }

  // A refused logic program is a mistake in the request: a validation error
  // that carries the backend's diagnostics.
  private invalidProgram(
    message: string,
    diagnostics: Diagnostic[],
  ): DHValidationError {
    const error = new DHValidationError(message);
    error.details = { diagnostics };
    return error;
  }

  /**
   * Validates the calculation: the base metadata schema check plus the logic
   * program. Surfaces logic-program errors through project validation and the
   * resource editor, catching .lp files edited by hand or brought in by an
   * import that bypassed the write-time gate.
   * @param content Metadata to validate; defaults to this resource's content.
   * @throws if the metadata or the logic program is invalid; a DHValidationError
   *         with the backend's diagnostics for the logic program.
   */
  public async validate(content?: CalculationMetadata) {
    await super.validate(content);
    // The logic program lives in a separate .lp file; skip it when content is
    // not yet loaded (during create the stub .lp is written after validation).
    const program = this.contentData().calculation;
    if (program === undefined) {
      return;
    }
    const validation = await this.validateLogicProgram(program);
    if (!validation.valid) {
      throw this.invalidProgram(
        `Invalid logic program for '${resourceNameToString(this.resourceName)}':\n${validation.errors.join('\n')}`,
        validation.diagnostics,
      );
    }
  }

  /**
   * Updates a file in the resource.
   * Rejects calculation content that is not a valid logic program.
   * @param fileName The name of the file to update.
   * @param changedContent The new content for the file.
   */
  public async updateFile(fileName: string, changedContent: string) {
    if (fileName === CONTENT_FILES.calculation) {
      const validation = await this.validateLogicProgram(changedContent);
      if (!validation.valid) {
        throw this.invalidProgram(
          `Invalid logic program for '${resourceNameToString(this.resourceName)}' update:\n${validation.errors.join('\n')}`,
          validation.diagnostics,
        );
      }
    }
    return super.updateFile(fileName, changedContent);
  }

  /**
   * List where calculation resource is used in cards, or other calculation resources.
   * Always returns card key references first, then calculation references.
   *
   * @param cards Optional. Check these cards for usage of this resource. If undefined, will check all cards.
   * @returns array of card keys and calculation filenames that refer this resource.
   */
  public async usage(cards?: Card[]): Promise<string[]> {
    const allCards = cards || super.cards();

    const [cardContentReferences, calculations] = await Promise.all([
      super.usage(allCards),
      super.calculations(),
    ]);

    const cardReferences = cardContentReferences.sort(sortCards);
    return [...new Set([...cardReferences, ...calculations])];
  }
}
