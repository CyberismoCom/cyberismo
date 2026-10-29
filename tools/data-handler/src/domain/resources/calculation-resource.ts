// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { join } from 'node:path';

import { validateProgram } from '@cyberismo/node-clingo';

import { CONTENT_FILES, type ResourceName } from '@cyberismo/model';
import { DefaultContent } from './create-defaults.js';
import { FolderResource } from './folder-resource.js';
import { resourceNameToString } from '../../shared/utils/resource-utils.js';
import { sortCards } from '../../shared/utils/card-utils.js';
import { writeFileSafe } from '../../shared/utils/file-utils.js';

import type { ClingoValidationResult } from '@cyberismo/node-clingo';
import type {
  CalculationContent,
  CalculationMetadata,
  Card,
} from '@cyberismo/model';
import type { Checkout } from '../../state/checkout/checkout.js';

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
   * Validates a calculation logic program without solving it.
   * Catches syntax errors and safety errors (e.g. unsafe variables).
   * @param content Logic program to validate; defaults to this resource's
   *                current calculation content.
   * @returns validation result with clingo diagnostics.
   */
  public validateLogicProgram(content?: string): ClingoValidationResult {
    return validateProgram(content ?? this.contentData().calculation);
  }

  /**
   * Validates the calculation: the base metadata schema check plus the logic
   * program. Surfaces logic-program errors through project validation and the
   * resource editor, catching .lp files edited by hand or brought in by an
   * import that bypassed the write-time gate.
   * @param content Metadata to validate; defaults to this resource's content.
   * @throws if the metadata or the logic program is invalid.
   */
  public async validate(content?: CalculationMetadata) {
    await super.validate(content);
    // The logic program lives in a separate .lp file; skip it when content is
    // not yet loaded (during create the stub .lp is written after validation).
    const program = this.contentData().calculation;
    if (program === undefined) {
      return;
    }
    const validation = this.validateLogicProgram(program);
    if (!validation.valid) {
      throw new Error(
        `Invalid logic program for '${resourceNameToString(this.resourceName)}':\n${validation.errors.join('\n')}`,
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
      const validation = this.validateLogicProgram(changedContent);
      if (!validation.valid) {
        throw new Error(
          `Invalid logic program for '${resourceNameToString(this.resourceName)}' update:\n${validation.errors.join('\n')}`,
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
