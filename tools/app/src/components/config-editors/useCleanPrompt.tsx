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

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CleanResult } from '@cyberismo/data-handler';
import { cleanProject } from '@/lib/api';
import { useAppDispatch } from '@/lib/hooks';
import { addNotification } from '@/lib/slices/notifications';
import { GenericConfirmModal } from '@/components/modals';

/**
 * Offers to remove the field values that cards store but their card types no
 * longer use. Call `maybePromptClean` after an edit that can leave such values
 * behind and render `cleanPromptModal`.
 */
export function useCleanPrompt() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const [cleanPrompt, setCleanPrompt] = useState<CleanResult | null>(null);
  const [cleaning, setCleaning] = useState(false);

  const maybePromptClean = async () => {
    try {
      const result = await cleanProject(true);
      if (result.findings.length > 0) {
        setCleanPrompt(result);
      }
    } catch {
      // Unused values are harmless, so a failed scan must not break the edit flow.
    }
  };

  const confirmClean = async () => {
    setCleaning(true);
    try {
      const { failedCards } = await cleanProject(false);
      dispatch(
        failedCards.length > 0
          ? addNotification({
              message: t('cleanPartial', { count: failedCards.length }),
              type: 'warning',
            })
          : addNotification({ message: t('cleanSuccess'), type: 'success' }),
      );
    } catch (error) {
      dispatch(
        addNotification({
          message:
            error instanceof Error ? error.message : (t('unknownError') ?? ''),
          type: 'error',
        }),
      );
    } finally {
      setCleaning(false);
      setCleanPrompt(null);
    }
  };

  const cleanPromptModal = (
    <GenericConfirmModal
      open={cleanPrompt !== null}
      onClose={() => {
        if (!cleaning) setCleanPrompt(null);
      }}
      title={t('cleanPromptTitle')}
      content={t('cleanPromptMessage', {
        count: cleanPrompt?.findings.length ?? 0,
        cards: t('cleanPromptCards', { count: cleanPrompt?.cardCount ?? 0 }),
      })}
      confirmText={t('cleanConfirm')}
      confirmColor="primary"
      confirmDisabled={cleaning}
      onConfirm={confirmClean}
    />
  );

  return { maybePromptClean, cleanPromptModal };
}
