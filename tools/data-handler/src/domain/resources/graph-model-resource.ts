// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { join } from 'node:path';

import { DefaultContent } from './create-defaults.js';
import { FolderResource } from './folder-resource.js';
import { resourceNameToString } from '../../shared/utils/resource-utils.js';
import { sortCards } from '../../shared/utils/card-utils.js';
import { writeFileSafe } from '../../shared/utils/file-utils.js';
import { CONTENT_FILES, type ResourceName } from '@cyberismo/model';

import type {
  Card,
  GraphModelMetadata,
  GraphModelContent,
} from '@cyberismo/model';
import type { Checkout } from '../../state/checkout/checkout.js';

/**
 * Graph model resource class.
 */
export class GraphModelResource extends FolderResource<
  GraphModelMetadata,
  GraphModelContent
> {
  /**
   * Creates an instance of GraphModelResource
   * @param checkout Project to use
   * @param name Resource name
   * @internal
   */
  constructor(checkout: Checkout, name: ResourceName) {
    super(checkout, name, 'graphModels');

    this.contentSchemaId = 'graphModelSchema';
    this.contentSchema = super.contentSchemaContent(this.contentSchemaId);
  }

  /**
   * Sets new metadata into the graph model object graph model.
   * @param newContent metadata content for the graph model.
   * @throws if 'newContent' is not valid.
   */
  public async create(newContent?: GraphModelMetadata) {
    if (!newContent) {
      newContent = DefaultContent.graphModel(
        resourceNameToString(this.resourceName),
      );
    } else {
      await this.validate(newContent);
    }

    await super.create(newContent);

    // Create the internal folder in 'create', instead of 'write'.
    const modelContent = `% add your calculations here for '${this.resourceName.identifier}'`;
    const modelFile = CONTENT_FILES.model;
    const calculationsFile = join(this.internalFolder, modelFile);
    await writeFileSafe(calculationsFile, modelContent, {
      flag: 'wx',
    });

    await this.loadContentFiles();
  }

  /**
   * List where this resource is used.
   * Always returns card key references first, then calculation references.
   *
   * @param cards Optional. Check these cards for usage of this resource. If undefined, will check all cards.
   * @returns array of card keys and calculation filenames that refer this resource.
   */
  public async usage(cards?: Card[]): Promise<string[]> {
    const allCards = cards ?? super.cards();
    const [relevantCards, calculations] = await Promise.all([
      super.usage(allCards),
      super.calculations(),
    ]);
    return [...relevantCards.sort(sortCards), ...calculations];
  }
}
