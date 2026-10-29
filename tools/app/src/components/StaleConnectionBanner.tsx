// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { useTranslation } from 'react-i18next';
import { useAppSelector } from '@/lib/hooks';
import { useConnectionStatus } from '@/lib/api/connectionStatus';
import StatusBanner from './StatusBanner';

export default function StaleConnectionBanner() {
  const disconnected = useConnectionStatus();
  // SessionExpiredBanner takes the same fixed top spot and, unlike this one,
  // cannot self-heal; let it own the space when both would otherwise show.
  const sessionExpired = useAppSelector(
    (state) => state.session.sessionExpired,
  );
  const { t } = useTranslation();

  if (!disconnected || sessionExpired) return null;

  return (
    <StatusBanner
      color="warning"
      message={t('connectionStale')}
      actionLabel={t('connectionStaleReload')}
      onAction={() => window.location.reload()}
    />
  );
}
