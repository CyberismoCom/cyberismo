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

import { cleanProject } from '@/lib/api';
import { useAppDispatch, useAppSelector } from '@/lib/hooks';
import { showCleanPrompt } from '@/lib/slices/cleanPrompt';
import { selectProjectPrefix } from '@/lib/slices/project';

/**
 * Offers to remove the field values that cards store but their card types no
 * longer use. Call `maybePromptClean` after an edit that can leave such values
 * behind; the prompt itself is rendered once by `<CleanPrompt />` in the app
 * shell, so it outlives an edit that navigates away from the caller.
 */
export function useCleanPrompt() {
  const dispatch = useAppDispatch();
  const projectPrefix = useAppSelector(selectProjectPrefix);

  const maybePromptClean = async () => {
    // The scan names its project rather than letting the request resolve one
    // from the URL, which an edit that navigates can already have changed.
    if (!projectPrefix) return;
    try {
      const findings = await cleanProject(true, projectPrefix);
      if (findings.findings.length > 0) {
        dispatch(showCleanPrompt({ findings, projectPrefix }));
      }
    } catch {
      // Unused values are harmless, so a failed scan must not break the edit flow.
    }
  };

  return { maybePromptClean };
}
