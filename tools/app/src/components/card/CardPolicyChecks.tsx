// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { useTranslation } from 'react-i18next';
import {
  ChecksAccordion,
  type CheckCollection,
} from '@/components/ChecksAccordion';
import type { PolicyCheckCollection } from '@cyberismo/model';

export const CardPolicyChecks = ({
  policyChecks,
  onGoToField,
  collapsible = true,
}: {
  policyChecks: PolicyCheckCollection;
  onGoToField?: (fieldName: string) => void;
  collapsible?: boolean;
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
      collapsible={collapsible}
    />
  );
};
