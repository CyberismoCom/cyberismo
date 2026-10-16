// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import BaseMacro from '../base-macro.js';
import macroMetadata from '@cyberismo/model/macros/image/metadata';
import { validateMacroContent } from '../registry.js';

import type { ImageMacroOptions } from '@cyberismo/model';
import type { MacroGenerationContext } from '../../../shared/interfaces/macros.js';
import type TaskQueue from '../task-queue.js';
import { cardAttachments } from '../../cards/read.js';

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
    const attachment = cardAttachments(context.checkout, cardKey).find(
      (a) => a.fileName === filename,
    );
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
    const projectPrefix = context.checkout.projectPrefix;
    return `image::/api/projects/${projectPrefix}/cards/${cardKey}/a/${options.fileName}[${attributes}]`;
  };
}
