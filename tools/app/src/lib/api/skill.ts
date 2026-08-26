/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/
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
