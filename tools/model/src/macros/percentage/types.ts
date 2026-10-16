// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

export interface PercentageOptions {
  /**
   * Title of percentage macro
   */
  title: string;
  /**
   * Percentage value
   */
  value: number;
  /**
   * Legend text below the macro
   */
  legend: string;
  /**
   * Color of the bar the represents the percentage
   */
  colour?: 'blue' | 'green' | 'yellow' | 'red' | 'orange' | 'purple';
}
