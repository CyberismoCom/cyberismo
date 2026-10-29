// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { Typography } from '@mui/joy';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useTree } from '../../lib/api';

export const dynamic = 'force-dynamic';

export default function CardsPage() {
  const { t } = useTranslation();
  const { tree, isValidating } = useTree();
  const navigate = useNavigate();

  useEffect(() => {
    if (tree && tree.length > 0 && !isValidating) {
      navigate(`/cards/${tree[0].key}`, { replace: true });
    }
  }, [tree, navigate, isValidating]);

  if (!tree || tree.length > 0) {
    return null;
  }

  return <Typography level="title-md">{t('emptyProject')}</Typography>;
}
