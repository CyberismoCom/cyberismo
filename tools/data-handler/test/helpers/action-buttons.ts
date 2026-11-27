// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { ActionButtonOptions, RenderedContent } from '@cyberismo/model';

import { macroParts } from './content-parts.js';

/** The options of every action button in rendered content, in order. */
export function actionButtons(
  rendered: RenderedContent,
): ActionButtonOptions[] {
  return macroParts<ActionButtonOptions>(rendered, 'action');
}
