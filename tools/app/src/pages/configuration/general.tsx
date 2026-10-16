// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { GeneralEditor } from '@/components/config-editors';
import { useResourceTree } from '@/lib/api';
import { useTranslation } from 'react-i18next';

function GeneralPage() {
  const { resourceTree } = useResourceTree();
  const { t } = useTranslation();

  const generalNode = resourceTree[0];
  if (!generalNode || generalNode.type !== 'general') {
    return <div>{t('unknownError')}</div>;
  }
  return <GeneralEditor node={generalNode} />;
}

export default GeneralPage;
