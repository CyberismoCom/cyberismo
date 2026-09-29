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
