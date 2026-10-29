// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import pixelWidth from 'string-pixel-width';

/**
 * Measures the width of a text string
 * @param text - The text to measure
 * @param font - The font to use
 * @param size - The size of the font
 * @param bold - Whether the text is bold
 * @returns The width of the text
 */
export function measureTextWidth(
  text: string,
  font: string,
  size: number,
  bold = false,
): number {
  return pixelWidth(text, { font, size, bold });
}
