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
import { cleanProject } from '@/lib/api';
import { useAppDispatch, useAppSelector } from '@/lib/hooks';
import { dismissCleanPrompt } from '@/lib/slices/cleanPrompt';
import { addNotification } from '@/lib/slices/notifications';
import { GenericConfirmModal } from '@/components/modals';

/**
 * Renders the offer to remove unused field values, for whichever edit asked for
 * it via `useCleanPrompt`. Lives in the app shell so that an edit which
 * navigates away - deleting a field type, for one - still gets a prompt.
 */
export function CleanPrompt() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const findings = useAppSelector((state) => state.cleanPrompt.findings);
  const [cleaning, setCleaning] = useState(false);

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
      dispatch(dismissCleanPrompt());
    }
  };

  return (
    <GenericConfirmModal
      open={findings !== null}
      onClose={() => {
        if (!cleaning) dispatch(dismissCleanPrompt());
      }}
      title={t('cleanPromptTitle')}
      content={t('cleanPromptMessage', {
        count: findings?.findings.length ?? 0,
        cards: t('cleanPromptCards', { count: findings?.cardCount ?? 0 }),
      })}
      confirmText={t('cleanConfirm')}
      confirmColor="primary"
      confirmDisabled={cleaning}
      onConfirm={confirmClean}
    />
  );
}
