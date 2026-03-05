/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2024
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

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
