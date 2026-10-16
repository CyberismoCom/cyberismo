// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { callApi, projectApiPaths } from '../swr';
import { mutate } from 'swr';
import type { CreateSkillData } from '@/lib/definitions';

export const createSkill = async (
  data: CreateSkillData,
  projectPrefix?: string,
) => {
  const apiPaths = projectApiPaths(projectPrefix);
  await callApi(apiPaths.skills(), 'POST', data);
  mutate(apiPaths.skills());
  mutate(apiPaths.resourceTree());
};

export type SkillPreviewRequest = {
  /** Unsaved skill.md content. Omit to render what is stored on disk. */
  skillContent?: string;
  /** Unsaved query.lp content. Omit to render what is stored on disk. */
  skillQuery?: string;
  /** Card context for a skill that applies to a specific card. */
  cardKey?: string;
};

/**
 * Renders a skill's instructions. Sent as a POST because the preview shows
 * unsaved editor content, which does not fit an SWR cache key.
 * @returns the rendered instructions as markdown.
 */
export const previewSkill = async (
  resourceName: string,
  request: SkillPreviewRequest,
  projectPrefix?: string,
) => {
  const apiPaths = projectApiPaths(projectPrefix);
  const result = await callApi<{ instructions: string }>(
    apiPaths.skillPreview(resourceName),
    'POST',
    request,
  );
  return result.instructions;
};
