// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Options for the image macro.
 * @param fileName - Name of the file to include.
 * @param cardKey - Key of the card to include the file from.
 * @param alt - Alternative text for the image.
 * @param title - Title of the image.
 */
export interface ImageMacroOptions {
  /**
   * Filename of the image
   */
  fileName: string;
  /**
   * By default, image is assumed to be under the current card. You can override this behaviour
   */
  cardKey?: string;
  /**
   * Alt text
   */
  alt?: string;
  /**
   * Title for the image
   */
  title?: string;
}
