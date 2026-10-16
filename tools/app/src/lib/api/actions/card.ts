// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { callApi, projectApiPaths } from '../../swr';

export async function parseContent(
  key: string,
  content: string,
  projectPrefix?: string,
) {
  const result = await callApi<{ adocContent: string }>(
    projectApiPaths(projectPrefix).cardParse(key),
    'POST',
    { content },
  );
  return result.adocContent;
}
