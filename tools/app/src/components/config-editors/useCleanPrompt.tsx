// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

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
