// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { join } from 'node:path';

import { copyDir } from '../../shared/utils/file-utils.js';
import { DefaultContent } from './create-defaults.js';
import { FolderResource } from './folder-resource.js';
import { getStaticDirectoryPath } from '@cyberismo/assets';
import { resourceNameToString } from '../../shared/utils/resource-utils.js';
import { sortCards } from '../../shared/utils/card-utils.js';

import type {
  Card,
  GraphViewContent,
  GraphViewMetadata,
  ResourceName,
} from '@cyberismo/model';
import type { Checkout } from '../../state/checkout/checkout.js';

/**
 * Graph view resource class.
 */
export class GraphViewResource extends FolderResource<
  GraphViewMetadata,
  GraphViewContent
> {
  /**
   * Creates instance of GraphViewResource
   * @param checkout Project to use
   * @param name Resource name
   * @internal
   */
  constructor(checkout: Checkout, name: ResourceName) {
    super(checkout, name, 'graphViews');

    this.contentSchemaId = 'graphViewSchema';
    this.contentSchema = super.contentSchemaContent(this.contentSchemaId);
  }

  /**
   * Sets new metadata into the graph view object.
   * @param newContent metadata content for the graph view.
   * @throws if 'newContent' is not valid.
   */
  public async create(newContent?: GraphViewMetadata) {
    if (!newContent) {
      newContent = DefaultContent.graphView(
        resourceNameToString(this.resourceName),
      );
    } else {
      await this.validate(newContent);
    }

    await super.create(newContent);
    await copyDir(
      join(await getStaticDirectoryPath(), 'defaultGraphView'),
      this.internalFolder,
    );

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
