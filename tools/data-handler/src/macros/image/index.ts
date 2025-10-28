/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2025
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import BaseMacro from '../base-macro.js';
import macroMetadata from './metadata.js';
import { validateMacroContent } from '../index.js';

import type { MacroGenerationContext } from '../../interfaces/macros.js';
import type TaskQueue from '../task-queue.js';

/**
 * Options for the image macro.
 * @param fileName - Name of the file to include.
 * @param cardKey - Key of the card to include the file from.
 * @param alt - Alternative text for the image.
 * @param title - Title of the image.
 */
export interface ImageMacroOptions {
  fileName: string;
  cardKey?: string;
  alt?: string;
  title?: string;
}

/**
 * Macro for including images in the content
 */
export default class ImageMacro extends BaseMacro {
  /**
   * Constructs ImageMacro instance.
   * @param tasksQueue Tasks queue
   */
  constructor(tasksQueue: TaskQueue) {
    super(macroMetadata, tasksQueue);
  }

  // Gets card attachment.
  private attachment(
    context: MacroGenerationContext,
    cardKey: string,
    filename: string,
  ) {
    const card = context.project.findCard(cardKey);
    const attachment =
      card.attachments?.find((a) => a.fileName === filename) ?? undefined;
    if (!attachment) {
      throw new Error(
        `Attachment file '${filename}' not found in card '${cardKey}'`,
      );
    }
    return attachment;
  }

  private buildImageAttributes(options: ImageMacroOptions): string {
    const attributes: string[] = [];

    if (options.alt !== undefined) {
      attributes.push(`alt="${options.alt}"`);
    }

    if (options.title !== undefined) {
      attributes.push(`title="${options.title}"`);
    }

    return attributes.join(',');
  }

  private validate(input: unknown): ImageMacroOptions {
    return validateMacroContent<ImageMacroOptions>(this.metadata, input);
  }

  handleValidate = (_: MacroGenerationContext, input: unknown) => {
    this.validate(input);
  };

  handleStatic = async (
    context: MacroGenerationContext,
    input: unknown,
  ): Promise<string> => {
    const options = this.validate(input);
    const cardKey = options.cardKey || context.cardKey;

    // Get the attachment
    const cardAttachment = this.attachment(context, cardKey, options.fileName);

    // Convert to base64
    const attachmentPath = join(cardAttachment?.path, cardAttachment?.fileName);
    const fileBuffer = readFileSync(attachmentPath);
    const base64Data = fileBuffer.toString('base64');

    // Build image attributes
    const attributes = this.buildImageAttributes(options);

    // Return as data URI for static mode (for export/PDF generation)
    return `image::data:${cardAttachment.mimeType};base64,${base64Data}[${attributes}]`;
  };

  handleInject = async (context: MacroGenerationContext, input: unknown) => {
    const options = this.validate(input);
    const cardKey = options.cardKey || context.cardKey;

    // Just verify that the attachment exists.
    this.attachment(context, cardKey, options.fileName);

    // Build image attributes
    const attributes = this.buildImageAttributes(options);

    // In inject mode, always use the API path for consistency
    return `image::/api/cards/${cardKey}/a/${options.fileName}[${attributes}]`;
  };
}
