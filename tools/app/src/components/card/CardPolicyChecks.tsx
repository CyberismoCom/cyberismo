/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026

  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { useTranslation } from 'react-i18next';
import {
  ChecksAccordion,
  type CheckCollection,
} from '@/components/ChecksAccordion';
import type { PolicyCheckCollection } from '@cyberismo/data-handler/types/queries';

export const CardPolicyChecks = ({
  policyChecks,
  onGoToField,
}: {
  policyChecks: PolicyCheckCollection;
  onGoToField?: (fieldName: string) => void;
}) => {
  const { t } = useTranslation();

  // Convert PolicyCheckCollection to CheckCollection format
  const checksData: CheckCollection = {
    successes: policyChecks.successes,
    failures: policyChecks.failures,
  };

  return (
    <ChecksAccordion
      checks={checksData}
      successTitle={t('passedPolicyChecks')}
      failureTitle={t('failedPolicyChecks')}
      successPassText={t('policyCheckPass')}
      failureFailText={t('policyCheckFail')}
      goToFieldText={t('goToField')}
      initialSuccessesExpanded={false}
      initialFailuresExpanded={true}
      onGoToField={onGoToField}
    />
  );
};
