// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { useTranslation } from 'react-i18next';

export default function Configuration() {
  const { t } = useTranslation();
  return <div>{t('selectResource')}</div>;
}
