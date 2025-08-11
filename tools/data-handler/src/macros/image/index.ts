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

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import mime from 'mime-types';

import { validateMacroContent } from '../index.js';

import type { MacroGenerationContext } from '../../interfaces/macros.js';
import macroMetadata from './metadata.js';
import BaseMacro from '../base-macro.js';
import type TaskQueue from '../task-queue.js';
import type { Calculate } from '../../commands/index.js';

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
  constructor(tasksQueue: TaskQueue) {
    super(macroMetadata, tasksQueue);
  }

  handleValidate = (input: unknown) => {
    this.validate(input);
  };

  handleStatic = async (
    context: MacroGenerationContext,
    input: unknown,
  ): Promise<string> => {
    const options = this.validate(input);
    const cardKey = options.cardKey || context.cardKey;

    // Get the attachment folder path
    const attachmentFolder =
      await context.project.cardAttachmentFolder(cardKey);
    if (!attachmentFolder) {
      throw new Error(`Card '${cardKey}' not found`);
    }

    // Read the file and convert to base64
    const attachmentPath = join(attachmentFolder, options.fileName);
    if (!existsSync(attachmentPath)) {
      throw new Error(
        `Attachment file '${options.fileName}' not found in card '${cardKey}'`,
      );
    }

    const fileBuffer = readFileSync(attachmentPath);
    const base64Data = fileBuffer.toString('base64');

    // Get mime type
    const mimeType = mime.lookup(attachmentPath) || 'application/octet-stream';

    // Build image attributes
    const attributes = this.buildImageAttributes(options);

    // Return as data URI for static mode (for export/PDF generation)
    return `image::data:${mimeType};base64,${base64Data}[${attributes}]`;
  };

  handleInject = async (context: MacroGenerationContext, input: unknown) => {
    const options = this.validate(input);
    const cardKey = options.cardKey || context.cardKey;

    // Verify that the card and attachment folder exist
    const attachmentFolder =
      await context.project.cardAttachmentFolder(cardKey);
    if (!attachmentFolder) {
      throw new Error(`Card '${cardKey}' not found`);
    }

    // Build image attributes
    const attributes = this.buildImageAttributes(options);

    // In inject mode, always use the API path for consistency
    return `image::/api/cards/${cardKey}/a/${options.fileName}[${attributes}]`;
  };

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
}
