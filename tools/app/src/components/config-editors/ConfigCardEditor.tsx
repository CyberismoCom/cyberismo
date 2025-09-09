/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2025
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { useCard } from '@/lib/api';
import CardEditor from '../CardEditor';
import type { AnyNode } from '@/lib/api/types';
import { useTranslation } from 'react-i18next';

export function ConfigCardEditor({ node }: { node: AnyNode }) {
  const { isLoading, error } = useCard(node.id);
  const { t } = useTranslation();
  if (isLoading) {
    return <div>{t('loading')}</div>;
  }
  if (error) {
    return <div>{error.message}</div>;
  }
  return (
    <CardEditor
      cardKey={node.id}
      afterSave={() => {}}
      readOnly={node?.readOnly}
    />
  );
}
