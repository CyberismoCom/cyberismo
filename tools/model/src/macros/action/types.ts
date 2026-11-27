// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The most programs an action may have, and the most characters in one
 * program. They bound what one click asks the server to solve; the action
 * macro's schema and the run route both hold them.
 */
export const MAX_ACTION_PROGRAMS = 20;
export const MAX_ACTION_PROGRAM_LENGTH = 65536;

/** The body of an action macro, as written in a report template. */
export interface ActionMacroOptions {
  /**
   * Label of the button
   */
  buttonLabel: string;
  /**
   * Logic programs run in order when the button is clicked
   */
  actions: string[];
}

/** What the action button gets: the programs and the card they run on. */
export interface ActionButtonOptions {
  /**
   * Label of the button
   */
  buttonLabel: string;
  /**
   * Card the programs run on: actionCard/1 in every program
   */
  cardKey: string;
  /**
   * Logic programs run in order when the button is clicked
   */
  programs: string[];
}
