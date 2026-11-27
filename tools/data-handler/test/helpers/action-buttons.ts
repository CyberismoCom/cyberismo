// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { ActionButtonOptions } from '@cyberismo/model';

/** The options of every action button in rendered content, in order. */
export function actionButtons(content: string): ActionButtonOptions[] {
  return [...content.matchAll(/<action-button options="([^"]*)">/g)].map(
    ([, options]) =>
      JSON.parse(Buffer.from(options, 'base64').toString('utf-8')),
  );
}
