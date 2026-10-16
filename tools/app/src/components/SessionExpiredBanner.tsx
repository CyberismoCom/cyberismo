// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { useTranslation } from 'react-i18next';
import { useAppSelector } from '@/lib/hooks';
import StatusBanner from './StatusBanner';

export default function SessionExpiredBanner() {
  const sessionExpired = useAppSelector(
    (state) => state.session.sessionExpired,
  );
  const { t } = useTranslation();

  if (!sessionExpired) return null;

  return (
    <StatusBanner
      color="danger"
      message={t('sessionExpired')}
      actionLabel={t('sessionExpiredLogIn')}
      onAction={() => window.location.reload()}
    />
  );
}
