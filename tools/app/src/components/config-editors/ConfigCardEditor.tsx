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

import { useRawCard, useResourceTree } from '@/lib/api';
import CardEditor from '../CardEditor';
import type { AnyNode } from '@/lib/api/types';
import { useTranslation } from 'react-i18next';
import { findCardParentInResourceTree, getConfig } from '@/lib/utils';
import { useAppRouter } from '@/lib/hooks';

export function ConfigCardEditor({ node }: { node: AnyNode }) {
  const card = useRawCard(node.id);
  const { resourceTree } = useResourceTree();
  const router = useAppRouter();
  const { t } = useTranslation();
  if (card.isLoading) {
    return <div>{t('loading')}</div>;
  }
  if (card.error) {
    return <div>{card.error.message}</div>;
  }
  const parent = resourceTree
    ? findCardParentInResourceTree(resourceTree, node.id)
    : null;
  return (
    <CardEditor
      cardKey={node.id}
      cardData={card}
      afterSave={() => {}}
      afterDelete={() =>
        router.push(parent ? `/configuration/${parent.name}` : '/configuration')
      }
      readOnly={node?.readOnly || getConfig().staticMode}
    />
  );
}
