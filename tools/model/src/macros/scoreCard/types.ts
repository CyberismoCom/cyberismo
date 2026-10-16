// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

export interface ScoreCardOptions {
  /**
   * Value shown in score card
   */
  value: number;
  /**
   * Optional legend text
   */
  legend?: string;
  /**
   * Option title text
   */
  title?: string;
  /**
   * Option unit that is next to the value
   */
  unit?: string;
}
