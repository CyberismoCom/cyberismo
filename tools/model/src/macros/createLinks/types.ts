// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

export interface CreateLinksOptions {
  /**
   * Card the links are created on. Defaults to the card holding the macro.
   */
  cardKey?: string;
  /**
   * Outbound links go from the card to the picked item, inbound the other way.
   * Defaults to outbound.
   */
  direction?: 'inbound' | 'outbound';
  /**
   * Type of the links to create
   */
  linkType: string;
  /**
   * Description prefilled on each link; only for link types that allow one
   */
  linkDescription?: string;
  /**
   * Label of the button
   */
  buttonLabel?: string;
  /**
   * Logic program that lists the items to pick from
   */
  query: string;
}
