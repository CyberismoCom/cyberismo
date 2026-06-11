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

import { useTranslation } from 'react-i18next';
import { useRawCard } from '@/lib/api';
import type { AnyNode } from '@/lib/api/types';
import { TemplateCardEditor } from './template-card/TemplateCardEditor';

/**
 * Entry point for editing a template (configuration) card. Loads the raw card
 * and hands it to the edit-first TemplateCardEditor (remounted per card so its
 * working draft is seeded fresh).
 */
export function ConfigCardEditor({ node }: { node: AnyNode }) {
  const card = useRawCard(node.id);
  const { t } = useTranslation();

  if (card.isLoading) {
    return <div>{t('loading')}</div>;
  }
  if (card.error || !card.card) {
    return <div>{card.error?.message ?? t('failedToLoad')}</div>;
  }

  return <TemplateCardEditor key={node.id} node={node} card={card.card} />;
}
