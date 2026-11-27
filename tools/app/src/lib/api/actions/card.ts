// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { RenderedCardContent } from '@cyberismo/model';

import { callApi, projectApiPaths } from '../../swr';

export async function parseContent(
  key: string,
  content: string,
  projectPrefix?: string,
): Promise<RenderedCardContent> {
  return callApi<RenderedCardContent>(
    projectApiPaths(projectPrefix).cardParse(key),
    'POST',
    { content },
  );
}
