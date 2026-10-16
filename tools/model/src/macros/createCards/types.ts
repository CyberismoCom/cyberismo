// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

export interface CreateCardsOptions {
  /**
   * Label of the button
   */
  buttonLabel: string;
  /**
   * Template to create cards from
   */
  template: string;
  /**
   * Allows forcing card creation under a certain card
   */
  cardKey?: string;

  /**
   * Allows creating a link at the same time
   */
  link?: {
    /**
     * Type of the link to create
     */
    linkType: string;
    /**
     * Direction of the link to create
     */
    direction: string;
    /**
     * Card key of target card of the link
     */
    cardKey: string;
  };
}
